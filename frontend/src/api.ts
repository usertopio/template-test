import { useSyncExternalStore } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { mimeFromName, uploadsInPieces, type Entry, type MediaItem, type MediaRole } from '@profile/shared';

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

// --- Auth token (see backend/src/auth.ts) -----------------------------------
const TOKEN_KEY = 'authToken';
let token = readToken();
const tokenListeners = new Set<() => void>();

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(next: string) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable; token lives for this tab only
  }
  tokenListeners.forEach((l) => l());
}

export function useToken(): string {
  return useSyncExternalStore(
    (l) => (tokenListeners.add(l), () => tokenListeners.delete(l)),
    () => token,
  );
}

// --- Requests ---------------------------------------------------------------
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        // FormData bodies (uploads) set their own multipart Content-Type.
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Network error: server down, restarting or asleep (Render free tier).
    throw new ApiError("Can't reach the server. It may be restarting; try again in a minute.", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') setToken(''); // expired or revoked: show login
  if (!res.ok) throw new ApiError(body.error ?? res.statusText, res.status, body.fields);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

/** Retry only network errors, e.g. while a sleeping server boots. */
const retryWhileWaking = (count: number, err: Error) => err instanceof ApiError && err.status === 0 && count < 6;

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => request<{ ok: true; media?: { ok: boolean; error?: string } }>('/health'),
    retry: retryWhileWaking,
    retryDelay: 5000,
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: () => request<{ required: boolean }>('/auth/status'),
    retry: retryWhileWaking,
    retryDelay: 5000,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => request<{ token: string }>('/auth/login', json('POST', { password })),
    onSuccess: ({ token }) => {
      setToken(token);
      qc.invalidateQueries();
    },
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
    /** `draft`: save unfinished (sections with drafts); saving without it publishes. */
    mutationFn: ({ id, data, draft = false }: { id?: string; data: EntryInput; draft?: boolean }) => {
      const query = draft ? '?draft=1' : '';
      return id
        ? request<Entry>(`/sections/${section}/${id}${query}`, json('PUT', data))
        : request<Entry>(`/sections/${section}${query}`, json('POST', data));
    },
    // Saving can register organizations or rename them across sections, so refresh them all.
    // Renaming an entry can also rename its media files.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section'] });
      qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
}

/** Remove one link from an entry, e.g. a certificate from the project it's linked to, without touching the rest. */
export function useUnlinkEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, id, target, targetId }: { section: string; id: string; target: string; targetId: string }) =>
      request<Entry>(`/sections/${section}/${id}/links/${target}/${targetId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section'] });
      qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
}

export function useDeleteEntry(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/sections/${section}/${id}`, { method: 'DELETE' }),
    // Deleting can unlink the entry from other sections and removes its media, so refresh them all.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['section'] });
      qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
}

// --- Media (see backend/src/routes/media.ts) --------------------------------
export const mediaQuery = { queryKey: ['media'], queryFn: () => request<MediaItem[]>('/media') };

export function useMedia({ enabled = true } = {}) {
  return useQuery({ ...mediaQuery, enabled });
}

/** What the user writes about a file. */
export interface MediaDetails {
  title: string;
  description: string;
  /** Empty: the same as English. */
  description_th: string;
}

export interface MediaUpload {
  section: string;
  entryId: string;
  title: string;
  description: string;
  /** Empty: the same as English. */
  description_th?: string;
  file: File;
  /** On credentials: the certificate file itself (default) or other media. */
  role?: MediaRole;
  /** Share of the file sent so far, 0–1 (files sent in pieces report as each one arrives). */
  onProgress?: (share: number) => void;
}

/** The file's type, from its name when the browser leaves it empty (e.g. some .mov files). */
export const fileType = (file: File) => file.type || mimeFromName(file.name) || '';

/** Videos and big images or PDFs go to Drive in pieces through the server, so they never sit in memory whole. */
async function uploadInPieces({ file, onProgress, ...fields }: MediaUpload): Promise<MediaItem> {
  const { uploadId, chunkSize } = await request<{ uploadId: string; chunkSize: number }>('/media/uploads', json('POST', { ...fields, mimeType: fileType(file), size: file.size }));
  try {
    for (let start = 0; ; start += chunkSize) {
      const end = Math.min(start + chunkSize, file.size);
      const res = await request<{ done: boolean; item?: MediaItem }>(`/media/uploads/${uploadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
        body: file.slice(start, end),
      });
      onProgress?.(end / file.size);
      if (res.done) return res.item!;
    }
  } catch (err) {
    request(`/media/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {});
    throw err;
  }
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upload: MediaUpload) => {
      if (uploadsInPieces(fileType(upload.file), upload.file.size)) return uploadInPieces(upload);
      const { file, onProgress, ...fields } = upload;
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.append(k, v);
      body.append('file', file); // last, so the server has the other fields when the file arrives
      return request<MediaItem>('/media', { method: 'POST', body }).then((item) => (onProgress?.(1), item));
    },
    // In the list at once, so its thumbnail can be dragged into place straight away: dragging cancels a reload still
    // under way, and an order sent without the new file would be refused and rolled back.
    onSuccess: (item) => {
      qc.setQueryData<MediaItem[]>(['media'], (items) => (items && !items.some((m) => m.id === item.id) ? [...items, item] : items));
      return qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
}

export function useUpdateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title, description, description_th }: { id: string } & MediaDetails) =>
      request<MediaItem>(`/media/${id}`, json('PUT', { title, description, description_th })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

/** Save a new order for an entry's media; the list updates at once and rolls back on failure. */
export function useReorderMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, ids }: { entryId: string; ids: string[] }) => request<MediaItem[]>('/media/order', json('PUT', { entryId, ids })),
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: ['media'] });
      const previous = qc.getQueryData<MediaItem[]>(['media']);
      qc.setQueryData<MediaItem[]>(['media'], (items) => items?.map((m) => (ids.includes(m.id) ? { ...m, position: String(ids.indexOf(m.id)) } : m)));
      return { previous };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(['media'], ctx?.previous),
    // The server answers with the entry's media in their saved order; no need to reload the list.
    onSuccess: (saved) => qc.setQueryData<MediaItem[]>(['media'], (items) => items?.map((m) => saved.find((x) => x.id === m.id) ?? m)),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

/**
 * Object URL for a media file. Files need the auth header, which <img src> can't send,
 * so they are fetched as blobs. A file never changes (a new upload gets a new id), so it is cached for the session.
 */
export const mediaFileQuery = (id: string) => ({
  queryKey: ['media-file', id],
  staleTime: Infinity,
  gcTime: Infinity,
  queryFn: async () => {
    const res = await fetch(`/api/media/${id}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? res.statusText, res.status);
    return URL.createObjectURL(await res.blob());
  },
});

/** A signed link to stream a file (videos play and seek without downloading it all). Links last 6 hours. */
export const mediaStreamQuery = (id: string) => ({
  queryKey: ['media-stream', id],
  staleTime: 5 * 60 * 60 * 1000,
  queryFn: async () => (await request<{ url: string }>(`/media/${id}/stream-url`)).url,
});

export function useMediaStreamUrl(id: string, enabled = true) {
  return useQuery({ ...mediaStreamQuery(id), enabled });
}

/** Drive's small preview of a file as a blob URL; fails (404) until Drive has made one, and callers fall back. */
export function useMediaThumbUrl(id: string, enabled = true) {
  return useQuery({
    queryKey: ['media-thumb', id],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/media/${id}/thumb?size=200`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new ApiError(res.statusText, res.status);
      return URL.createObjectURL(await res.blob());
    },
  });
}

export function useMediaFileUrl(id: string, enabled = true) {
  return useQuery({ ...mediaFileQuery(id), enabled });
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
