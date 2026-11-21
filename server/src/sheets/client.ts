import { auth, sheets, type sheets_v4 } from '@googleapis/sheets';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface SheetsContext {
  api: sheets_v4.Sheets;
  spreadsheetId: string;
}

/** Build an authenticated Sheets client from env vars. Throws a readable error when misconfigured. */
export function createSheetsContext(env = process.env): SheetsContext {
  const spreadsheetId = env.GOOGLE_SHEET_ID?.trim();
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not set (see server/.env.example)');

  let client;
  if (env.GOOGLE_KEY_FILE?.trim()) {
    client = new auth.GoogleAuth({ keyFile: env.GOOGLE_KEY_FILE.trim(), scopes: SCOPES });
  } else if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    client = new auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // .env files usually store the key with literal "\n" sequences.
      key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });
  } else {
    throw new Error('Set GOOGLE_KEY_FILE, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (see server/.env.example)');
  }

  return { api: sheets({ version: 'v4', auth: client }), spreadsheetId };
}

/** A1 range for a whole tab, quoting the name so spaces and symbols are safe. */
export function tabRange(tab: string, cells = 'A:ZZ'): string {
  return `'${tab.replace(/'/g, "''")}'!${cells}`;
}
