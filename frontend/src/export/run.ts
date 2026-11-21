// Making an export: gather what it shows, embed the images, write the document, and zip it with the
// original files when asked. The writers (and their large libraries) load only when used.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DOMAIN_LIST, LOCATION_LIST, ORGANIZATIONS, SKILLS, isVideo, type Entry, type MediaItem } from '@profile/shared';
import { entriesQuery, mediaFileQuery, mediaQuery, mediaStreamQuery } from '../api';
import { ZIP_MAX_BYTES, cancellable, saveAs, zipBlob } from '../download';
import { loadImage, type ExportImage } from './images';
import type { Writer } from './layout';
import { FORMATS, buildExport, exportFileName, exportFiles, languagesOf, relatedSections, type ExportDoc, type ExportFormat, type ExportLanguage, type ExportPart } from './model';

export interface ExportOptions {
  format: ExportFormat;
  lang: ExportLanguage;
  /** Also put the original files in a .zip with the document. */
  includeFiles: boolean;
}

const WRITERS: Record<ExportFormat, () => Promise<Writer>> = {
  docx: () => import('./docx').then((m) => m.writeDocx),
  xlsx: () => import('./xlsx').then((m) => m.writeXlsx),
  pdf: () => import('./pdf').then((m) => m.writePdf),
};

export type ExportStep = { step: 'images' | 'files'; done: number; total: number } | { step: 'writing' };

/** Images of the export, fetched one after another (each is cached for the session). */
async function embeddable(qc: QueryClient, items: MediaItem[], onStep: (s: ExportStep) => void, signal?: AbortSignal) {
  const images = new Map<string, ExportImage>();
  const list = items.filter((m) => m.mimeType === 'image/jpeg' || m.mimeType === 'image/png');
  for (const [i, item] of list.entries()) {
    onStep({ step: 'images', done: i, total: list.length });
    const url = await cancellable(qc.fetchQuery(mediaFileQuery(item.id)), signal);
    const image = await cancellable(loadImage(url, item.mimeType).catch(() => null), signal);
    if (image) images.set(item.id, image);
  }
  return images;
}

async function originals(qc: QueryClient, files: { path: string; item: MediaItem }[], onStep: (s: ExportStep) => void, signal?: AbortSignal) {
  const urls: { path: string; url: string }[] = [];
  for (const { path, item } of files) {
    onStep({ step: 'files', done: urls.length, total: files.length });
    urls.push({ path, url: await cancellable(isVideo(item.mimeType) ? qc.fetchQuery(mediaStreamQuery(item.id)) : qc.fetchQuery(mediaFileQuery(item.id)), signal) });
  }
  return urls;
}

/** An export ready to write: its content, its embedded images, and the original files to zip with it. */
export interface PreparedExport {
  title: string;
  options: ExportOptions;
  doc: ExportDoc;
  images: Map<string, ExportImage>;
  files: { path: string; item: MediaItem }[];
  /** The written document, once it has been (a PDF preview writes it). */
  blob?: Blob;
}

/** Gather what the export shows and embed its images; the preview and the download both start here. */
export async function prepareExport(qc: QueryClient, title: string, parts: ExportPart[], options: ExportOptions, onStep: (s: ExportStep) => void = () => {}, signal?: AbortSignal): Promise<PreparedExport> {
  const thai = languagesOf(options.lang).includes('th');
  const [media, related, organizations, skills, domains, locations] = await cancellable(Promise.all([
    qc.fetchQuery(mediaQuery),
    Promise.all(relatedSections(parts).map(async (key) => [key, await qc.fetchQuery(entriesQuery(key))] as const)).then((pairs) => new Map<string, Entry[]>(pairs)),
    thai ? qc.fetchQuery(entriesQuery(ORGANIZATIONS)) : undefined,
    thai ? qc.fetchQuery(entriesQuery(SKILLS)) : undefined,
    thai ? qc.fetchQuery(entriesQuery(DOMAIN_LIST)) : undefined,
    thai ? qc.fetchQuery(entriesQuery(LOCATION_LIST)) : undefined,
  ]), signal);
  const files = options.includeFiles ? exportFiles(parts, media) : [];
  const bytes = files.reduce((n, f) => n + (Number(f.item.size) || 0), 0);
  if (bytes > ZIP_MAX_BYTES) {
    throw new Error(`The files add up to ${Math.round(bytes / 1024 / 1024)} MB, too much for one zip. Export without the files, or with fewer entries.`);
  }

  const doc = buildExport(title, parts, options.lang, { related, media, names: { organizations, skills, domains, locations } }, { includeFiles: files.length > 0 });
  const shown = doc.sections.flatMap((s) => s.entries.flatMap((e) => e.files.map((f) => f.item)));
  const images = await embeddable(qc, shown, onStep, signal);
  return { title, options, doc, images, files };
}

/** The document itself, written once. */
export async function writeExport(prepared: PreparedExport, onStep: (s: ExportStep) => void = () => {}, signal?: AbortSignal): Promise<Blob> {
  if (!prepared.blob) {
    onStep({ step: 'writing' });
    const write = await cancellable(WRITERS[prepared.options.format](), signal);
    prepared.blob = await cancellable(write(prepared.doc, prepared.images), signal);
  }
  return prepared.blob;
}

/** Offer a prepared export as a download: the document, or a .zip of it and a media/ folder. */
export async function saveExport(qc: QueryClient, prepared: PreparedExport, onStep: (s: ExportStep) => void = () => {}, signal?: AbortSignal) {
  const blob = await writeExport(prepared, onStep, signal);
  const { ext } = FORMATS[prepared.options.format];
  const name = exportFileName(prepared.title);
  if (!prepared.files.length) return saveAs(blob, `${name}.${ext}`);
  const urls = await originals(qc, prepared.files, onStep, signal);
  const docUrl = URL.createObjectURL(blob);
  try {
    const zip = await zipBlob([{ path: `${name}.${ext}`, url: docUrl }, ...urls], signal);
    signal?.throwIfAborted();
    saveAs(zip, `${name}.zip`);
  } finally {
    URL.revokeObjectURL(docUrl);
  }
}

/** Make the export and offer it as a download. */
export async function runExport(qc: QueryClient, title: string, parts: ExportPart[], options: ExportOptions, onStep: (s: ExportStep) => void = () => {}) {
  await saveExport(qc, await prepareExport(qc, title, parts, options, onStep), onStep);
}

/**
 * The export's steps for a dialog: preview it, then save it (reusing what the preview prepared), with progress and
 * errors, until cancelled. Closing the dialog cancels it too, so a closed dialog never starts a download later.
 */
export function useExport() {
  const qc = useQueryClient();
  const [step, setStep] = useState<ExportStep | null>(null);
  const [error, setError] = useState('');
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  /** null when it failed (the error says why) or was cancelled. `action` gets where to report its steps. */
  async function attempt<T>(action: (onStep: (s: ExportStep) => void, signal: AbortSignal) => Promise<T>, failure: string): Promise<T | null> {
    const controller = new AbortController();
    const { signal } = controller;
    running.current = controller;
    setError('');
    setStep({ step: 'images', done: 0, total: 0 });
    // Steps reported after a cancel are dropped, so the buttons go back to rest at once.
    const result = await action((s) => signal.aborted || setStep(s), signal).catch((err: Error) => {
      if (!signal.aborted) setError(`${failure}: ${err.message}`);
      return null;
    });
    if (running.current === controller) {
      running.current = null;
      setStep(null);
    }
    return signal.aborted ? null : result;
  }

  function cancel() {
    running.current?.abort();
    running.current = null;
    setStep(null);
  }

  /** Download the export; `prepared` is the previewed one, when it was previewed with the same choices. */
  const run = async (title: string, parts: ExportPart[], options: ExportOptions, prepared?: PreparedExport): Promise<boolean> =>
    (await attempt(async (onStep, signal) => {
      await saveExport(qc, prepared ?? (await prepareExport(qc, title, parts, options, onStep, signal)), onStep, signal);
      return true;
    }, 'Export failed')) ?? false;

  /** Prepare the export for a preview; a PDF is written too, since the preview shows the real file. */
  const preview = (title: string, parts: ExportPart[], options: ExportOptions): Promise<PreparedExport | null> =>
    attempt(async (onStep, signal) => {
      const prepared = await prepareExport(qc, title, parts, options, onStep, signal);
      if (options.format === 'pdf') await writeExport(prepared, onStep, signal);
      return prepared;
    }, "Couldn't preview");

  return { run, preview, cancel, step, error, clearError: () => setError('') };
}
