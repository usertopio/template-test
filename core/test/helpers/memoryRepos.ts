import { randomUUID } from 'node:crypto';
import { MEDIA, MEDIA_TAB, SECTIONS, type Entry } from '@profile/shared';
import { NotFoundError } from '../../src/errors';
import type { Repos, Repository } from '../../src/repo';

/** In-memory stand-in for a sheet tab, so tests never touch Google Sheets. */
export class MemoryRepository implements Repository {
  rows: Entry[] = [];

  constructor(readonly tab: string) {}

  async list() {
    return this.rows.map((r) => ({ ...r }));
  }

  async get(id: string) {
    return { ...this.find(id) };
  }

  async create(data: Record<string, string>) {
    const now = new Date().toISOString();
    const entry = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as Entry;
    this.rows.push(entry);
    return { ...entry };
  }

  async update(id: string, data: Record<string, string>) {
    const existing = this.find(id);
    Object.assign(existing, data, { id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    return { ...existing };
  }

  async remove(id: string) {
    this.find(id);
    this.rows = this.rows.filter((r) => r.id !== id);
  }

  private find(id: string) {
    const entry = this.rows.find((r) => r.id === id);
    if (!entry) throw new NotFoundError(`${this.tab} entry ${id} not found`);
    return entry;
  }
}

/** One empty in-memory repository per section (plus Media), like a freshly bootstrapped sheet. */
export function memoryRepos(): Repos & Map<string, MemoryRepository> {
  return new Map([...SECTIONS.map((s) => [s.key, new MemoryRepository(s.tab)] as const), [MEDIA, new MemoryRepository(MEDIA_TAB)]]);
}

/** Names of the rows in a section, for compact assertions. */
export async function names(repos: Repos, section: string, field = 'name') {
  return (await repos.get(section)!.list()).map((e) => e[field]);
}
