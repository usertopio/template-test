import type { Entry } from '@profile/shared';

/** CRUD over one tab's entries. Each runtime has its own (Sheets API, SpreadsheetApp); tests use an in-memory one. */
export interface Repository {
  list(): Promise<Entry[]>;
  get(id: string): Promise<Entry>;
  create(data: Record<string, string>): Promise<Entry>;
  update(id: string, data: Record<string, string>): Promise<Entry>;
  remove(id: string): Promise<void>;
}

/** One repository per section key, plus MEDIA. */
export type Repos = Map<string, Repository>;
export type RepoProvider = () => Promise<Repos>;
