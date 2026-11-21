import { randomUUID } from 'node:crypto';
import type { Entry } from '@profile/shared';
import { tabRange, type SheetsContext } from './client';

const CACHE_TTL_MS = 10_000;

interface Snapshot {
  header: string[];
  /** Entries paired with their 1-based sheet row number. */
  rows: { row: number; entry: Entry }[];
  at: number;
}

export class NotFoundError extends Error {
  status = 404;
}

/**
 * CRUD over one sheet tab. Row 1 is the header; columns are mapped by header name,
 * so reordering columns in the sheet by hand is safe.
 */
export class SheetRepository {
  private snapshot?: Snapshot;

  constructor(
    private ctx: SheetsContext,
    readonly tab: string,
    private resolveSheetId: (tab: string) => Promise<number>,
  ) {}

  async list(): Promise<Entry[]> {
    return (await this.load()).rows.map((r) => r.entry);
  }

  async get(id: string): Promise<Entry> {
    return (await this.find(id)).entry;
  }

  async create(data: Record<string, string>): Promise<Entry> {
    const { header } = await this.load();
    const now = new Date().toISOString();
    const entry = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as Entry;
    await this.ctx.api.spreadsheets.values.append({
      spreadsheetId: this.ctx.spreadsheetId,
      range: tabRange(this.tab),
      valueInputOption: 'RAW', // RAW keeps values as plain strings (no formulas / auto-dates)
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [toRow(header, entry)] },
    });
    this.invalidate();
    return entry;
  }

  async update(id: string, data: Record<string, string>): Promise<Entry> {
    const { header } = await this.load();
    const { row, entry: existing } = await this.find(id);
    const entry = { ...existing, ...data, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() } as Entry;
    await this.ctx.api.spreadsheets.values.update({
      spreadsheetId: this.ctx.spreadsheetId,
      range: tabRange(this.tab, `A${row}`),
      valueInputOption: 'RAW',
      requestBody: { values: [toRow(header, entry)] },
    });
    this.invalidate();
    return entry;
  }

  async remove(id: string): Promise<void> {
    const { row } = await this.find(id);
    const sheetId = await this.resolveSheetId(this.tab);
    await this.ctx.api.spreadsheets.batchUpdate({
      spreadsheetId: this.ctx.spreadsheetId,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }],
      },
    });
    this.invalidate();
  }

  invalidate() {
    this.snapshot = undefined;
  }

  private async find(id: string) {
    const match = (await this.load()).rows.find((r) => r.entry.id === id);
    if (!match) throw new NotFoundError(`${this.tab} entry ${id} not found`);
    return match;
  }

  private async load(): Promise<Snapshot> {
    if (this.snapshot && Date.now() - this.snapshot.at < CACHE_TTL_MS) return this.snapshot;

    const res = await this.ctx.api.spreadsheets.values.get({
      spreadsheetId: this.ctx.spreadsheetId,
      range: tabRange(this.tab),
    });
    const [header = [], ...values] = (res.data.values ?? []) as string[][];
    const rows = values
      .map((cells, i) => ({ row: i + 2, entry: fromRow(header, cells) }))
      .filter((r) => r.entry.id); // skip blank / hand-typed rows without an id

    this.snapshot = { header, rows, at: Date.now() };
    return this.snapshot;
  }
}

function toRow(header: string[], entry: Record<string, string>): string[] {
  return header.map((col) => entry[col] ?? '');
}

function fromRow(header: string[], cells: string[]): Entry {
  return Object.fromEntries(header.map((col, i) => [col, cells[i] ?? ''])) as Entry;
}
