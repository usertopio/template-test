import { useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { mediaFileQuery, mediaStreamQuery } from './api';
import { entryFolderName, isVideo, mediaOf, roleSubfolder, uniqueFileName, type Entry, type MediaItem, type SectionDef } from '@profile/shared';

/**
 * `promise`, unless `signal` aborts first (the person cancelled). A fetch already under way finishes in the
 * background, but nothing waits for it, so a cancel takes effect at once.
 */
export function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** Zips are built in memory; past this, download files one at a time instead. */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

/** Paths inside a zip: entry folders like Drive's when several entries are included, files at the top for one. */
export function zipPaths(section: SectionDef, entries: Entry[], media: MediaItem[], { folders }: { folders: boolean }): { path: string; item: MediaItem }[] {
  const out: { path: string; item: MediaItem }[] = [];
  const taken = new Map<string, string[]>();
  const usedFolders: string[] = [];
  for (const entry of entries) {
    const items = mediaOf(media, entry.id);
    if (!items.length) continue;
    // Two entries can share a folder name; keep their files apart.
    const folder = folders ? uniqueFileName(entryFolderName(section, entry), usedFolders) : '';
    if (folders) usedFolders.push(folder);
    const names = taken.get(folder) ?? [];
    taken.set(folder, names);
    for (const item of items) {
      // Like Drive: a certificate's other media sit in Media/.
      const sub = roleSubfolder(section, item.role).map((f) => `${f}/`).join('');
      const name = uniqueFileName(`${sub}${item.fileName || item.title}`, names);
      names.push(name);
      out.push({ path: folder ? `${folder}/${name}` : name, item });
    }
  }
  return out;
}

/**
 * Zip files fetched as blob URLs (already-compressed images, PDFs and videos are stored, not re-compressed).
 * Runs in a Web Worker where available, so packing large videos doesn't freeze the page; fflate is only
 * loaded then, not with the app.
 */
export async function zipBlob(files: { path: string; url: string }[], signal?: AbortSignal): Promise<Blob> {
  const zip = typeof Worker === 'undefined' ? await cancellable(zipHere(files), signal) : await zipInWorker(files, signal);
  return new Blob([zip as BlobPart], { type: 'application/zip' });
}

function zipInWorker(files: { path: string; url: string }[], signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' });
    // Cancelled: stop packing rather than finish a zip of a gigabyte nobody wants.
    signal?.addEventListener('abort', () => (worker.terminate(), reject(signal.reason)), { once: true });
    worker.onmessage = (e: MessageEvent<{ zip?: Uint8Array; error?: string }>) => {
      worker.terminate();
      if (e.data.zip) resolve(e.data.zip);
      else reject(new Error(e.data.error ?? 'Zipping failed'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Zipping failed'));
    };
    worker.postMessage(files);
  });
}

/** Without workers (tests, very old browsers): the same, on this thread. */
async function zipHere(files: { path: string; url: string }[]): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  const contents: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) contents[f.path] = [new Uint8Array(await (await fetch(f.url)).arrayBuffer()), { level: 0 }];
  return zipSync(contents);
}

/** Offer a blob or URL as a file download. */
export function saveAs(target: Blob | string, fileName: string) {
  const a = document.createElement('a');
  a.href = typeof target === 'string' ? target : URL.createObjectURL(target);
  a.download = fileName;
  a.click();
  if (typeof target !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A URL to read a file from: the cached blob, or for videos the streaming link. */
const fileUrl = (qc: QueryClient, item: MediaItem): Promise<string> =>
  isVideo(item.mimeType) ? qc.fetchQuery(mediaStreamQuery(item.id)) : qc.fetchQuery(mediaFileQuery(item.id));

/** URLs for all the files, one after another, reporting how many are ready (kept out of the hook: the React Compiler can't optimize loops inside try yet). */
async function fileUrls(qc: QueryClient, files: { path: string; item: MediaItem }[], onProgress: (done: number) => void, signal: AbortSignal) {
  const urls: { path: string; url: string }[] = [];
  for (const f of files) {
    urls.push({ path: f.path, url: await cancellable(fileUrl(qc, f.item), signal) });
    onProgress(urls.length);
  }
  return urls;
}

/** One file: straight from the server (a video streams to disk instead of into memory). */
async function saveOne(qc: QueryClient, item: MediaItem, signal: AbortSignal) {
  const url = await cancellable(isVideo(item.mimeType) ? qc.fetchQuery(mediaStreamQuery(item.id)).then((u) => `${u}&download=1`) : qc.fetchQuery(mediaFileQuery(item.id)), signal);
  saveAs(url, item.fileName);
}

/** Zip several files and offer the zip, unless cancelled before it's ready. */
async function saveZip(qc: QueryClient, files: { path: string; item: MediaItem }[], zipName: string, onProgress: (done: number) => void, signal: AbortSignal) {
  const zip = await zipBlob(await fileUrls(qc, files, onProgress, signal), signal);
  signal.throwIfAborted();
  saveAs(zip, zipName);
}

/**
 * Download media as a .zip (or a single file directly), with progress while files are fetched, until cancelled.
 * `key` says which button started it (e.g. an entry id), so its progress and error show there.
 */
export function useMediaDownload() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ key: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const running = useRef<AbortController | null>(null);

  async function download(files: { path: string; item: MediaItem }[], zipName: string, key = '') {
    if (!files.length || progress) return;
    setError(null);
    const total = files.length;
    const bytes = files.reduce((n, f) => n + (Number(f.item.size) || 0), 0);
    if (total > 1 && bytes > ZIP_MAX_BYTES) {
      return setError({ key, message: `These files add up to ${Math.round(bytes / 1024 / 1024)} MB, too much for one zip. Download the large videos one at a time.` });
    }
    const controller = new AbortController();
    running.current = controller;
    setProgress({ key, done: 0, total });
    try {
      if (total === 1) await saveOne(qc, files[0].item, controller.signal);
      else await saveZip(qc, files, zipName, (done) => controller.signal.aborted || setProgress({ key, done, total }), controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError({ key, message: `Download failed: ${(err as Error).message}` });
    }
    // Cancelled, then started again: the new download's progress stays.
    if (running.current === controller) {
      running.current = null;
      setProgress(null);
    }
  }

  function cancel() {
    running.current?.abort();
    running.current = null;
    setProgress(null);
  }

  return { download, cancel, progress, error };
}
