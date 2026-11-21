import { randomUUID } from 'node:crypto';
import type { Entry } from '@profile/shared';
import { NotFoundError, type Repos, type Repository } from '@profile/core';
import { tabRange, type SheetsContext } from './client';

const CACHE_TTL_MS = 10_000;
/**
 * A write only trusts row positions read this recently; older ones are read again first, so a row
 * moved in the sheet by hand (sorted, inserted, deleted) isn't overwritten by mistake.
 */
const WRITE_FRESH_MS = 2_000;

interface Snapshot {
  header: string[];
  /** Entries paired with their 1-based sheet row number. */
  rows: { row: number; entry: Entry }[];
  at: number;
}

export type { Repos, Repository };

/**
 * CRUD over one sheet tab via the Sheets API. Row 1 is the header; columns are mapped by header name,
 * so reordering columns in the sheet by hand is safe.
 *
 * Updates and deletes address rows by number, so writes to a tab run one at a time: otherwise a delete
 * could shift the rows under an update that is still in flight (e.g. the background Drive sync) and the
 * update would overwrite a different entry. Each write works from fresh row positions and keeps the
 * cached copy in step with what it changed.
 */
export class SheetRepository implements Repository {
  private snapshot?: Snapshot;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private ctx: SheetsContext,
    readonly tab: string,
    private resolveSheetId: (tab: string) => Promise<number>,
  ) {}

  async list(): Promise<Entry[]> {
    return (await this.load()).rows.map((r) => ({ ...r.entry }));
  }

  async get(id: string): Promise<Entry> {
    return { ...this.find(await this.load(), id).entry };
  }

  create(data: Record<string, string>): Promise<Entry> {
    return this.exclusive(async (snap) => {
      const now = new Date().toISOString();
      const entry = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as Entry;
      const res = await this.ctx.api.spreadsheets.values.append({
        spreadsheetId: this.ctx.spreadsheetId,
        range: tabRange(this.tab),
        valueInputOption: 'RAW', // RAW keeps values as plain strings (no formulas / auto-dates)
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [toRow(snap.header, entry)] },
      });
      // Where Google put it, e.g. "'Skills'!A7:E7"; if it doesn't say, read the tab again next time.
      const row = Number(res?.data?.updates?.updatedRange?.match(/![A-Z]+(\d+)/)?.[1]);
      if (row) snap.rows.push({ row, entry });
      else this.invalidate();
      return { ...entry };
    });
  }

  update(id: string, data: Record<string, string>): Promise<Entry> {
    return this.exclusive(async (snap) => {
      const found = this.find(snap, id);
      const entry = { ...found.entry, ...data, id, createdAt: found.entry.createdAt, updatedAt: new Date().toISOString() } as Entry;
      await this.ctx.api.spreadsheets.values.update({
        spreadsheetId: this.ctx.spreadsheetId,
        range: tabRange(this.tab, `A${found.row}`),
        valueInputOption: 'RAW',
        requestBody: { values: [toRow(snap.header, entry)] },
      });
      found.entry = entry;
      return { ...entry };
    });
  }

  remove(id: string): Promise<void> {
    return this.exclusive(async (snap) => {
      const found = this.find(snap, id);
      const sheetId = await this.resolveSheetId(this.tab);
      await this.ctx.api.spreadsheets.batchUpdate({
        spreadsheetId: this.ctx.spreadsheetId,
        requestBody: {
          requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: found.row - 1, endIndex: found.row } } }],
        },
      });
      // Rows below move up by one.
      snap.rows = snap.rows.filter((r) => r !== found).map((r) => (r.row > found.row ? { ...r, row: r.row - 1 } : r));
    });
  }

  invalidate() {
    this.snapshot = undefined;
  }

  /** Run a write after the ones before it, with row positions no older than WRITE_FRESH_MS. */
  private exclusive<T>(write: (snap: Snapshot) => Promise<T>): Promise<T> {
    const run = this.writes.then(async () => {
      if (this.snapshot && Date.now() - this.snapshot.at >= WRITE_FRESH_MS) this.invalidate();
      const snap = await this.load();
      try {
        const result = await write(snap);
        snap.at = Date.now(); // our own change: the positions are still right
        return result;
      } catch (err) {
        this.invalidate(); // unsure what happened: read again next time
        throw err;
      }
    });
    this.writes = run.catch(() => {});
    return run;
  }

  private find(snap: Snapshot, id: string) {
    const match = snap.rows.find((r) => r.entry.id === id);
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
