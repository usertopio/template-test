import { MEDIA, MEDIA_COLUMNS, MEDIA_TAB, SECTIONS, sectionColumns } from '@profile/shared';
import { tabRange, type SheetsContext } from './client';
import { SheetRepository } from './repo';

/** Every tab the app keeps: one per section, plus Media. */
const TABS = [
  ...SECTIONS.map((s) => ({ key: s.key, tab: s.tab, columns: sectionColumns(s) })),
  { key: MEDIA, tab: MEDIA_TAB, columns: [...MEDIA_COLUMNS] },
];

/**
 * Make sure every tab exists with a header row, then return one repository per tab (keyed by section key, or MEDIA),
 * and the keys of the tabs just created. Existing tabs keep their columns; any missing columns are appended.
 */
export async function bootstrapSheets(ctx: SheetsContext): Promise<{ repos: Map<string, SheetRepository>; created: Set<string> }> {
  const sheetIds = await loadSheetIds(ctx);

  const missingTabs = TABS.filter((s) => !sheetIds.has(s.tab));
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
    ranges: TABS.map((s) => tabRange(s.tab, '1:1')),
  });
  const headerUpdates = TABS.flatMap(({ tab, columns }, i) => {
    const current = (headers.data.valueRanges?.[i]?.values?.[0] ?? []) as string[];
    const missing = columns.filter((c) => !current.includes(c));
    return missing.length ? [{ range: tabRange(tab, '1:1'), values: [[...current, ...missing]] }] : [];
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

  return { repos: new Map(TABS.map((s) => [s.key, new SheetRepository(ctx, s.tab, resolveSheetId)])), created: new Set(missingTabs.map((s) => s.key)) };
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
