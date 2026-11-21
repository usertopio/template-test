import { SECTIONS, sectionColumns } from '@profile/shared';
import { tabRange, type SheetsContext } from './client';
import { SheetRepository } from './repo';

/**
 * Make sure every section has a tab with a header row, then return one repository per section.
 * Existing tabs keep their columns; any missing columns are appended to the header.
 */
export async function bootstrapSheets(ctx: SheetsContext): Promise<Map<string, SheetRepository>> {
  const sheetIds = await loadSheetIds(ctx);

  const missingTabs = SECTIONS.filter((s) => !sheetIds.has(s.tab));
  if (missingTabs.length) {
    const res = await ctx.api.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: {
        requests: missingTabs.map((s) => ({
          addSheet: { properties: { title: s.tab, gridProperties: { frozenRowCount: 1 } } },
        })),
      },
    });
    for (const reply of res.data.replies ?? []) {
      const p = reply.addSheet?.properties;
      if (p?.title && p.sheetId != null) sheetIds.set(p.title, p.sheetId);
    }
    console.log(`[sheets] created tabs: ${missingTabs.map((s) => s.tab).join(', ')}`);
  }

  // Read all header rows in one call and fix any that are missing columns.
  const headers = await ctx.api.spreadsheets.values.batchGet({
    spreadsheetId: ctx.spreadsheetId,
    ranges: SECTIONS.map((s) => tabRange(s.tab, '1:1')),
  });
  const headerUpdates = SECTIONS.flatMap((section, i) => {
    const current = (headers.data.valueRanges?.[i]?.values?.[0] ?? []) as string[];
    const missing = sectionColumns(section).filter((c) => !current.includes(c));
    return missing.length ? [{ range: tabRange(section.tab, '1:1'), values: [[...current, ...missing]] }] : [];
  });
  if (headerUpdates.length) {
    await ctx.api.spreadsheets.values.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: headerUpdates },
    });
  }

  const resolveSheetId = async (tab: string) => {
    if (!sheetIds.has(tab)) for (const [k, v] of await loadSheetIds(ctx)) sheetIds.set(k, v);
    const id = sheetIds.get(tab);
    if (id == null) throw new Error(`Sheet tab "${tab}" not found`);
    return id;
  };

  return new Map(SECTIONS.map((s) => [s.key, new SheetRepository(ctx, s.tab, resolveSheetId)]));
}

async function loadSheetIds(ctx: SheetsContext): Promise<Map<string, number>> {
  const res = await ctx.api.spreadsheets.get({ spreadsheetId: ctx.spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  const ids = new Map<string, number>();
  for (const sheet of res.data.sheets ?? []) {
    const p = sheet.properties;
    if (p?.title && p.sheetId != null) ids.set(p.title, p.sheetId);
  }
  return ids;
}
