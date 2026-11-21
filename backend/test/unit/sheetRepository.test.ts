import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetsContext } from '../../src/sheets/client';
import { SheetRepository } from '../../src/sheets/repo';

/** A fake Sheets API holding one tab's cells (row 1 = header). */
function fakeSheet(cells: string[][]) {
  const values = {
    get: vi.fn(async () => ({ data: { values: cells.map((r) => [...r]) } })),
    append: vi.fn(async ({ requestBody }: { requestBody: { values: string[][] } }): Promise<unknown> => {
      cells.push(...requestBody.values);
      return undefined;
    }),
    update: vi.fn(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      const row = Number(range.match(/!A(\d+)$/)![1]);
      cells[row - 1] = requestBody.values[0];
    }),
  };
  const batchUpdate = vi.fn(async ({ requestBody }: { requestBody: { requests: { deleteDimension: { range: { startIndex: number } } }[] } }) => {
    cells.splice(requestBody.requests[0].deleteDimension.range.startIndex, 1);
  });
  const ctx = { spreadsheetId: 'sheet-1', api: { spreadsheets: { values, batchUpdate } } } as unknown as SheetsContext;
  return { ctx, values, batchUpdate, cells };
}

describe('SheetRepository', () => {
  let sheet: ReturnType<typeof fakeSheet>;
  let repo: SheetRepository;

  beforeEach(() => {
    // Columns deliberately out of order and a row without an id (typed by hand).
    sheet = fakeSheet([
      ['name', 'id', 'createdAt', 'updatedAt', 'category'],
      ['React', 'id-1', '2026-01-01', '2026-01-01', 'Engineering'],
      ['Scribble', '', '', '', ''],
      ['Editing', 'id-2', '2026-01-02', '2026-01-02'],
    ]);
    repo = new SheetRepository(sheet.ctx, 'Skills', async () => 42);
  });

  it('maps rows by header name, skips rows without an id and fills short rows with ""', async () => {
    expect(await repo.list()).toEqual([
      { name: 'React', id: 'id-1', createdAt: '2026-01-01', updatedAt: '2026-01-01', category: 'Engineering' },
      { name: 'Editing', id: 'id-2', createdAt: '2026-01-02', updatedAt: '2026-01-02', category: '' },
    ]);
    expect(sheet.values.get).toHaveBeenCalledWith({ spreadsheetId: 'sheet-1', range: "'Skills'!A:ZZ" });
  });

  it('caches reads until a write', async () => {
    await repo.list();
    await repo.list();
    expect(sheet.values.get).toHaveBeenCalledTimes(1);
    await repo.create({ name: 'Sound' });
    await repo.list();
    expect(sheet.values.get).toHaveBeenCalledTimes(2);
  });

  it('appends new rows in header order with an id and timestamps', async () => {
    const entry = await repo.create({ name: 'Sound', category: 'Film' });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.createdAt).toBe(entry.updatedAt);
    expect(sheet.cells.at(-1)).toEqual(['Sound', entry.id, entry.createdAt, entry.updatedAt, 'Film']);
    expect(sheet.values.append.mock.calls[0][0]).toMatchObject({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  });

  it('updates the right sheet row and keeps id and createdAt', async () => {
    const updated = await repo.update('id-2', { name: 'Video editing', id: 'hacked', createdAt: 'x' });
    expect(sheet.values.update.mock.calls[0][0].range).toBe("'Skills'!A4");
    expect(updated).toMatchObject({ name: 'Video editing', id: 'id-2', createdAt: '2026-01-02' });
    expect(sheet.cells[3].slice(0, 3)).toEqual(['Video editing', 'id-2', '2026-01-02']);
  });

  it('deletes the right sheet row', async () => {
    await repo.remove('id-2');
    expect(sheet.batchUpdate.mock.calls[0][0].requestBody.requests[0]).toEqual({
      deleteDimension: { range: { sheetId: 42, dimension: 'ROWS', startIndex: 3, endIndex: 4 } },
    });
    expect((await repo.list()).map((e) => e.id)).toEqual(['id-1']);
  });

  it('throws a 404 for unknown ids', async () => {
    await expect(repo.get('missing')).rejects.toMatchObject({ status: 404 });
    await expect(repo.update('missing', {})).rejects.toMatchObject({ status: 404 });
  });
});

describe('SheetRepository writes', () => {
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** A sheet whose writes take a moment to land, like the real API; updates slower than deletes. */
  function slowSheet(cells: string[][]) {
    const sheet = fakeSheet(cells);
    sheet.values.update.mockImplementation(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      await tick(20);
      cells[Number(range.match(/!A(\d+)$/)![1]) - 1] = requestBody.values[0];
    });
    sheet.batchUpdate.mockImplementation(async ({ requestBody }: { requestBody: { requests: { deleteDimension: { range: { startIndex: number } } }[] } }) => {
      await tick(5);
      cells.splice(requestBody.requests[0].deleteDimension.range.startIndex, 1);
    });
    return sheet;
  }

  it('runs overlapping writes one after another, so a delete never shifts rows under an update', async () => {
    const sheet = slowSheet([['id', 'name'], ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]);
    const repo = new SheetRepository(sheet.ctx, 'Media', async () => 1);
    await repo.list();
    // e.g. the background Drive sync updating row "c" while the user deletes row "a"
    await Promise.all([repo.update('c', { name: 'C2' }), repo.remove('a'), repo.update('d', { name: 'D2' })]);
    expect(sheet.cells).toEqual([['id', 'name'], ['b', 'B'], ['c', 'C2'], ['d', 'D2']]);
  });

  it('keeps going after a failed write, and reads again after it', async () => {
    const sheet = fakeSheet([['id', 'name'], ['a', 'A']]);
    const repo = new SheetRepository(sheet.ctx, 'Media', async () => 1);
    sheet.values.update.mockRejectedValueOnce(new Error('quota'));
    await expect(repo.update('a', { name: 'X' })).rejects.toThrow('quota');
    await repo.update('a', { name: 'Y' });
    expect(sheet.cells[1]).toEqual(['a', 'Y']);
    expect(sheet.values.get).toHaveBeenCalledTimes(2);
  });

  it('reads row positions again before writing if they may have changed by hand', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const sheet = fakeSheet([['id', 'name'], ['a', 'A'], ['b', 'B']]);
    const repo = new SheetRepository(sheet.ctx, 'Media', async () => 1);
    await repo.list();
    sheet.cells.splice(1, 0, ['x', 'Typed in by hand']); // "b" is now row 4, not 3
    now.mockReturnValue(1_003_000); // 3 s later: still cached for reads, too old to write by
    await repo.update('b', { name: 'B2' });
    expect(sheet.cells).toEqual([['id', 'name'], ['x', 'Typed in by hand'], ['a', 'A'], ['b', 'B2']]);
    now.mockRestore();
  });

  it('tracks rows it appends, without reading the tab again', async () => {
    const sheet = fakeSheet([['id', 'name'], ['a', 'A']]);
    sheet.values.append.mockImplementation(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
      sheet.cells.push(...requestBody.values);
      return { data: { updates: { updatedRange: `'Media'!A${sheet.cells.length}:B${sheet.cells.length}` } } };
    });
    const repo = new SheetRepository(sheet.ctx, 'Media', async () => 1);
    const created = await repo.create({ name: 'New' });
    await repo.update(created.id, { name: 'Renamed' });
    expect(sheet.cells[2]).toEqual([created.id, 'Renamed']);
    expect(sheet.values.get).toHaveBeenCalledTimes(1);
  });
});
