import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Entry } from '@profile/shared';

export type EntryInput = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? res.statusText, res.status, body.fields);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => request<{ ok: true }>('/health'),
    retry: false,
  });
}

export const entriesQuery = (section: string) => ({
  queryKey: ['section', section],
  queryFn: () => request<Entry[]>(`/sections/${section}`),
});

export function useEntries(section: string) {
  return useQuery(entriesQuery(section));
}

/** Entries of several sections at once, keyed by section. */
export function useEntriesBySection(sections: string[]): Map<string, Entry[]> {
  const results = useQueries({ queries: sections.map(entriesQuery) });
  return new Map(sections.map((s, i) => [s, results[i].data ?? []]));
}

export function useSaveEntry(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: EntryInput }) =>
      id
        ? request<Entry>(`/sections/${section}/${id}`, json('PUT', data))
        : request<Entry>(`/sections/${section}`, json('POST', data)),
    // Saving can register organizations or rename them across sections, so refresh them all.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['section'] }),
  });
}

export function useDeleteEntry(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/sections/${section}/${id}`, { method: 'DELETE' }),
    // Deleting can unlink the entry from other sections, so refresh them all.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['section'] }),
  });
}

export function useSingle(section: string) {
  return useQuery({ queryKey: ['single', section], queryFn: () => request<Entry | null>(`/single/${section}`) });
}

export function useSaveSingle(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EntryInput) => request<Entry>(`/single/${section}`, json('PUT', data)),
    onSuccess: (entry) => qc.setQueryData(['single', section], entry),
  });
}

export async function downloadExport() {
  const data = await request<unknown>('/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `profile-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
