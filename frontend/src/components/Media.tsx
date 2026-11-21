import { useEffect, useId, useState } from 'react';
import { Check, Download, ExternalLink, FileText, Film, FolderOpen, Image, LayoutGrid, ListChecks, LoaderCircle, NotebookText, Trash2, X, type LucideIcon } from 'lucide-react';
import { MEDIA_TYPES, driveFileUrl, driveFolderUrl, formatLabel, mediaDescription, mediaKind, uniqueFileName, type MediaItem, type MediaKind } from '@profile/shared';
import { fileType, useDeleteMedia, useMediaFileUrl, useMediaStreamUrl, useMediaThumbUrl } from '../api';
import { useMediaDownload } from '../download';
import { useLanguage } from '../language';
import ConfirmDialog from './ConfirmDialog';
import CopyButton from './CopyButton';
import Modal from './Modal';

/** A stored media item, or a file picked in the browser that isn't uploaded yet. */
export type MediaSource = { item: MediaItem } | { file: File };

export const mimeOf = (source: MediaSource) => ('item' in source ? source.item.mimeType : fileType(source.file));
export const kindOf = (source: MediaSource) => mediaKind(mimeOf(source));
/** "PNG", "PDF", "TXT"…: the format shown on a file. */
export const formatOfSource = (source: MediaSource) => formatLabel(mimeOf(source), 'item' in source ? source.item.fileName : source.file.name);

/** A file's size, e.g. "240 KB" or "3.4 MB". */
export function formatSize(bytes: number): string {
  if (!(bytes >= 0)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** A stored or picked file's size, e.g. "3.4 MB"; '' when a stored one has none recorded (Number('') would be 0). */
export const sizeOfSource = (source: MediaSource) =>
  'file' in source ? formatSize(source.file.size) : source.item.size?.trim() ? formatSize(Number(source.item.size)) : '';

/**
 * URL to show a media source: a blob URL for picked files; for stored ones, the fetched file
 * (images, PDFs) or a signed streaming link (videos, which play without downloading it all).
 */
export function useMediaSrc(source: MediaSource, enabled = true): string | undefined {
  const item = 'item' in source ? source.item : undefined;
  const file = 'file' in source ? source.file : undefined;
  const video = kindOf(source) === 'video';
  const fetched = useMediaFileUrl(item?.id ?? '', !!item && enabled && !video);
  const streamed = useMediaStreamUrl(item?.id ?? '', !!item && enabled && video);
  const [local, setLocal] = useState<string>();
  useEffect(() => {
    if (!file || !enabled) return;
    const url = URL.createObjectURL(file);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [file, enabled]);
  return item ? (video ? streamed.data : fetched.data) : local;
}

function PdfIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/**
 * Square preview. Stored files show Drive's small thumbnail (a PDF's first page, a video frame) instead of
 * loading the whole file; until Drive has one, and for files not uploaded yet: the image itself, a video's
 * first frame, or an icon for a PDF or text file. Each is marked with its format (JPG, PDF, TXT…).
 */
export function MediaThumb({ source, title, className = 'h-20 w-20' }: { source: MediaSource; title: string; className?: string }) {
  const kind = kindOf(source);
  const item = 'item' in source ? source.item : undefined;
  const thumb = useMediaThumbUrl(item?.id ?? '', !!item);
  const fallback = !item || thumb.isError;
  // A PDF or text file shows an icon rather than being loaded whole.
  const src = useMediaSrc(source, fallback && kind !== 'pdf' && kind !== 'text');
  const badge = (text: string) => (
    <span aria-hidden className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/60 pl-0.5 text-xs text-white">
      {text}
    </span>
  );
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 ${className}`}>
      {thumb.data ? (
        <>
          <img src={thumb.data} alt={title} loading="lazy" className="h-full w-full object-cover" />
          {kind === 'video' && badge('▶')}
        </>
      ) : !fallback ? (
        <span className="h-4 w-4 animate-pulse rounded-full bg-slate-300 dark:bg-slate-600" />
      ) : kind === 'pdf' ? (
        <PdfIcon />
      ) : kind === 'text' ? (
        <NotebookText size={28} strokeWidth={1.6} aria-hidden />
      ) : !src ? (
        <span className="h-4 w-4 animate-pulse rounded-full bg-slate-300 dark:bg-slate-600" />
      ) : kind === 'video' ? (
        <>
          {/* Only the start is fetched (#t jumps past a black first frame). */}
          <video src={`${src}#t=0.1`} preload="metadata" muted playsInline aria-label={title} className="h-full w-full object-cover" />
          {badge('▶')}
        </>
      ) : (
        <img src={src} alt={title} className="h-full w-full object-cover" />
      )}
      <span title="File type" className="absolute right-0.5 bottom-0.5 rounded bg-slate-950/60 px-1 text-[9px] leading-tight font-semibold text-white">
        {formatOfSource(source)}
      </span>
    </span>
  );
}

/** A text file's contents, read from its URL (a stored file) or straight from the file picked or written. */
function TextPreview({ source, src, title }: { source: MediaSource; src: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const file = 'file' in source ? source.file : undefined;
  useEffect(() => {
    let current = true;
    (file ? file.text() : fetch(src).then((r) => r.text()))
      .then((t) => current && setText(t))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [file, src]);
  if (failed) return <p className="text-sm text-red-600 dark:text-red-400">Couldn't read this file.</p>;
  if (text === null) return <div className="h-48 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />;
  return (
    <pre aria-label={title} className="max-h-[55vh] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm whitespace-pre-wrap text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
      {text}
    </pre>
  );
}

/** Large preview: the image, the video with controls, or the PDF in a frame with a link to open it. */
export function MediaPreview({ source, title }: { source: MediaSource; title: string }) {
  const src = useMediaSrc(source);
  const kind = kindOf(source);
  if (!src) return <div className="h-48 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />;
  if (kind === 'video') return <video src={src} controls playsInline aria-label={title} className="mx-auto max-h-[55vh] w-full rounded-md bg-black" />;
  if (kind === 'text') return <TextPreview source={source} src={src} title={title} />;
  if (kind === 'pdf') {
    return (
      <div className="space-y-2">
        <iframe src={src} title={title} className="h-[55vh] w-full rounded-md border border-slate-200 dark:border-slate-700" />
        <a href={src} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
          Open PDF in a new tab ↗
        </a>
      </div>
    );
  }
  return <img src={src} alt={title} className="mx-auto max-h-[55vh] rounded-md object-contain" />;
}

// The format a certificate page is shown in: the JPG loads fastest, the PNG next; a PDF only when that's all there is.
const PAGE_FORMATS = ['image/jpeg', 'image/png', 'application/pdf'];

/**
 * One file per page of a certificate, in upload order. Each page uploaded is stored as PNG, JPG and PDF with the
 * same title, so the title tells the pages apart.
 */
export function certificatePages(files: MediaItem[]): MediaItem[] {
  const rank = (m: MediaItem) => (PAGE_FORMATS.includes(m.mimeType) ? PAGE_FORMATS.indexOf(m.mimeType) : PAGE_FORMATS.length);
  const pages = new Map<string, MediaItem>();
  for (const file of files) {
    const shown = pages.get(file.title);
    if (!shown || rank(file) < rank(shown)) pages.set(file.title, file);
  }
  return [...pages.values()];
}

/**
 * A certificate as it looks, in a preview: each page large, opened (to download it) with a click. A certificate
 * stored only as a PDF shows the PDF itself.
 */
export function CertificatePages({ files, name }: { files: MediaItem[]; name: string }) {
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const pages = certificatePages(files);
  if (!pages.length) return null;
  return (
    <div className="space-y-2">
      {pages.map((page, i) => {
        const alt = pages.length > 1 ? `${name}, page ${i + 1}` : name;
        return mediaKind(page.mimeType) === 'image' ? (
          <button key={page.id} type="button" onClick={() => setViewing(page)} title={`Open ${page.title}`} className="block w-full rounded-md hover:opacity-90">
            <CertificateImage item={page} alt={alt} />
          </button>
        ) : (
          <MediaPreview key={page.id} source={{ item: page }} title={alt} />
        );
      })}
      <Modal open={viewing !== null} title={viewing?.title ?? ''} onRequestClose={() => setViewing(null)}>
        {viewing && <MediaViewer item={viewing} />}
      </Modal>
    </div>
  );
}

function CertificateImage({ item, alt }: { item: MediaItem; alt: string }) {
  const src = useMediaSrc({ item });
  // White behind it in both themes, like the paper it's printed on.
  const frame = 'w-full rounded-md border border-slate-200 bg-white dark:border-slate-700';
  if (!src) return <span className={`${frame} block aspect-[1.414] animate-pulse dark:bg-slate-800`} />;
  return <img src={src} alt={alt} className={`${frame} block max-h-[60vh] object-contain`} />;
}

/**
 * A link that opens a file or folder in Google Drive, in a new tab: the owner can manage it there (share, move,
 * open with another app). Nothing without an id.
 */
export function DriveLink({ href, label, text, className = '' }: { href: string; label: string; text?: string; className?: string }) {
  if (!href) return null;
  const Icon = href.includes('/folders/') ? FolderOpen : ExternalLink;
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className={`inline-flex shrink-0 items-center gap-1 rounded-md text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 ${className}`}>
      <Icon size={text ? 14 : 18} aria-hidden />
      {text}
    </a>
  );
}

/** The Drive folder all of `items` are in; '' when they're in several (e.g. a post's files from different entries). */
export const sharedFolder = (items: MediaItem[]) => (items.length && items.every((m) => m.folderId === items[0].folderId) ? items[0].folderId : '');

/** Files ticked across a page's entries, while it is selecting (see MediaStrip). */
export interface MediaSelection {
  ids: string[];
  toggle: (id: string) => void;
}

/** Where the download icon points: the fetched file, or for videos the streaming link marked as a download. */
export function useDownloadHref(item: MediaItem): string | undefined {
  const src = useMediaSrc({ item });
  if (!src) return undefined;
  return mediaKind(item.mimeType) === 'video' ? `${src}&download=1` : src;
}

const KIND_ICONS: Record<MediaKind, LucideIcon> = { image: Image, video: Film, pdf: FileText, text: NotebookText };
const FORMATS = Object.keys(MEDIA_TYPES);

/** A file's format for the switch, e.g. "PNG" or "MP4" (from its extension if the type isn't one we know). */
const formatOf = (item: MediaItem) => formatLabel(item.mimeType, item.fileName);

/**
 * A card's files, each a thumbnail with its title and description beside it (like LinkedIn's media), with an All / JPG / PNG / PDF / MP4… switch listing the formats it has (even just one).
 * Several formats can be picked at once; All (or picking every format) shows everything.
 * The switch is a segmented control, not pills, so it doesn't read as the card's tags. Clicking a file opens it.
 * Descriptions are in the language the profile is shown in, in full however long.
 * "Select files" lets you tick thumbnails and download just those, as a .zip named `zipName` (or the file itself),
 * or delete them.
 * With `selection`, the page is selecting instead (see SectionPage): thumbnails tick files in its selection.
 */
export function MediaStrip({
  items,
  label,
  zipName = 'Media',
  selection,
  canDelete = true,
}: {
  items: MediaItem[];
  label?: string;
  zipName?: string;
  selection?: MediaSelection;
  /** false for files shown here but owned by other entries (a post's picked photos): they open and download only. */
  canDelete?: boolean;
}) {
  const lang = useLanguage();
  const id = useId();
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  // null: thumbnails open files; otherwise the ids ticked for download or delete.
  const [ownChosen, setChosen] = useState<string[] | null>(null);
  const remove = useDeleteMedia();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const chosen = selection ? selection.ids : ownChosen;
  const files = useMediaDownload();
  // Formats picked; none means All.
  const [picked, setPicked] = useState<string[]>([]);
  if (!items.length) return null;
  // Each format once, in upload-list order (JPG, PNG, PDF, MP4, MOV, WEBM), with its count and icon.
  const formats = new Map<string, { count: number; kind: MediaKind; order: number }>();
  for (const item of items) {
    const f = formatOf(item);
    const order = FORMATS.indexOf(item.mimeType);
    formats.set(f, { count: (formats.get(f)?.count ?? 0) + 1, kind: mediaKind(item.mimeType), order: order < 0 ? FORMATS.length : order });
  }
  const listed = [...formats].sort(([, a], [, b]) => a.order - b.order);
  // Ignore picks whose files are gone (deleted since).
  const active = picked.filter((f) => formats.has(f));
  const shown = active.length ? items.filter((m) => active.includes(formatOf(m))) : items;
  function toggle(value: string) {
    if (value === 'all') return setPicked([]);
    const next = active.includes(value) ? active.filter((f) => f !== value) : [...active, value];
    // Every format picked is the same as All (a single format can still be picked on its own).
    setPicked(formats.size > 1 && next.length === formats.size ? [] : next);
  }
  const segment = (value: string, count: number, Icon: LucideIcon) => {
    const on = value === 'all' ? !active.length : active.includes(value);
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(value)}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 ${
          on ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
        }`}
      >
        <Icon size={13} aria-hidden />
        {value === 'all' ? 'All' : value} <span className={`tabular-nums ${on ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>{count}</span>
      </button>
    );
  };

  // Ticked files that still exist, in display order.
  const ticked = chosen ? items.filter((m) => chosen.includes(m.id)) : [];
  const tick = selection ? selection.toggle : (id: string) => setChosen((c) => (c?.includes(id) ? c.filter((x) => x !== id) : [...(c ?? []), id]));
  async function downloadTicked() {
    const names: string[] = [];
    const paths = ticked.map((item) => {
      const path = uniqueFileName(item.fileName || item.title, names);
      names.push(path);
      return { path, item };
    });
    await files.download(paths, `${zipName}.zip`);
    setChosen(null);
  }
  /** Delete the ticked files one by one; any that fail stay ticked, with the reason. */
  async function deleteTicked() {
    setDeleting(true);
    setDeleteError('');
    const failed: string[] = [];
    let reason = '';
    for (const item of ticked) {
      try {
        await remove.mutateAsync(item.id);
      } catch (err) {
        failed.push(item.id);
        reason = (err as Error).message;
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    if (failed.length) {
      setChosen(failed);
      setDeleteError(`Couldn't delete ${failed.length} ${failed.length === 1 ? 'file' : 'files'}: ${reason}`);
    } else setChosen(null);
  }
  const busy = !!files.progress || deleting;
  const toolButton = 'inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800';

  return (
    // A labelled strip (Certificate file, Detail files, Media) is named by it, so each block can be told apart.
    <div role={label ? 'group' : undefined} aria-label={label} className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p> : <span />}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show media" className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            {segment('all', items.length, LayoutGrid)}
            {listed.map(([f, { count, kind }]) => segment(f, count, KIND_ICONS[kind]))}
          </div>
          {!chosen && <DriveLink href={driveFolderUrl(sharedFolder(items))} label="Open folder in Google Drive" text="Drive" className="px-2 py-1 text-xs" />}
          {!chosen && !selection && (
            <button
              type="button"
              onClick={() => {
                setDeleteError('');
                setChosen([]);
              }}
              className={`${toolButton} text-xs text-slate-600 dark:text-slate-400`}
            >
              <ListChecks size={14} aria-hidden />
              Select files
            </button>
          )}
        </div>
      </div>
      {ownChosen && (
        <div role="toolbar" aria-label="Selected media" className="flex flex-wrap items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900 dark:bg-blue-500/10 dark:text-blue-100">
          <span className="mr-auto px-1">{ticked.length ? `${ticked.length} selected` : `Tick files to download${canDelete ? ' or delete' : ''}`}</span>
          <button type="button" onClick={() => setChosen([...new Set([...ownChosen, ...shown.map((m) => m.id)])])} className={toolButton}>
            Select all{shown.length < items.length ? ' shown' : ''}
          </button>
          <button type="button" onClick={downloadTicked} disabled={!ticked.length || busy} aria-label={`Download ${ticked.length} selected`} className={`${toolButton} font-medium`}>
            {files.progress ? <LoaderCircle size={14} aria-hidden className="animate-spin" /> : <Download size={14} aria-hidden />}
            {files.progress && files.progress.total > 1 ? `${files.progress.done}/${files.progress.total}` : `Download ${ticked.length || ''}`.trim()}
          </button>
          {files.progress && (
            <button type="button" onClick={files.cancel} aria-label="Cancel download" title="Cancel download" className={toolButton}>
              <X size={14} aria-hidden />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={!ticked.length || busy}
              aria-label={`Delete ${ticked.length} selected`}
              title="Delete selected"
              className={`${toolButton} text-red-700 dark:text-red-400`}
            >
              <Trash2 size={14} aria-hidden />
              {ticked.length || ''}
            </button>
          )}
          <button type="button" onClick={() => setChosen(null)} disabled={busy} className={toolButton}>
            Cancel
          </button>
        </div>
      )}
      {files.error && <p className="text-xs text-red-600 dark:text-red-400">{files.error.message}</p>}
      {deleteError && <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${ticked.length} ${ticked.length === 1 ? 'file' : 'files'}?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteTicked()}
      >
        {ticked.length === 1 ? 'It' : 'They'} will be removed from this entry and moved to the Drive trash. This can't be undone here.
      </ConfirmDialog>
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((item) => {
          const on = !!chosen?.includes(item.id);
          const description = mediaDescription(item, lang);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (chosen ? tick(item.id) : setViewing(item))}
              title={item.title}
              // Named by its title (the thumbnail's alt text would say it twice); the description is read after.
              aria-label={chosen ? `Select ${item.title}` : item.title}
              aria-describedby={description ? `${id}-${item.id}` : undefined}
              aria-pressed={chosen ? on : undefined}
              className={`flex min-w-0 items-start gap-2 rounded-md p-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${on ? 'bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-500/10' : ''}`}
            >
              <span className="relative shrink-0">
                <MediaThumb source={{ item }} title={item.title} className="h-16 w-16" />
                {chosen && (
                  <span
                    aria-hidden
                    className={`absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-white bg-white/80 dark:border-slate-500 dark:bg-slate-900/80'}`}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 py-0.5">
                <span className="block text-sm font-medium wrap-anywhere text-slate-800 dark:text-slate-200">{item.title}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{[formatOf(item), sizeOfSource({ item })].filter(Boolean).join(' · ')}</span>
                {description && (
                  <span id={`${id}-${item.id}`} lang={lang} className="block text-xs whitespace-pre-line text-slate-600 dark:text-slate-400">
                    {description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <Modal open={viewing !== null} title={viewing?.title ?? ''} onRequestClose={() => setViewing(null)}>
        {viewing && <MediaViewer item={viewing} onDeleted={canDelete ? () => setViewing(null) : undefined} />}
      </Modal>
    </div>
  );
}

/**
 * One file, opened from its thumbnail. With `onDeleted` (the entry's own files, not a linked certificate's),
 * it can be deleted here too, after a confirmation.
 */
export function MediaViewer({ item, onDeleted }: { item: MediaItem; onDeleted?: () => void }) {
  const href = useDownloadHref(item);
  const remove = useDeleteMedia();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const lang = useLanguage();
  const description = mediaDescription(item, lang);
  return (
    <div className="space-y-3 overflow-y-auto px-5 py-4">
      <MediaPreview source={{ item }} title={item.title} />
      {description && (
        <div className="group/copy flex items-start gap-1">
          <p className="min-w-0 flex-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{description}</p>
          <CopyButton reveal text={description} label="description" />
        </div>
      )}
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="break-all">{[item.fileName, sizeOfSource({ item })].filter(Boolean).join(' · ')}</span>
        <span className="flex shrink-0 items-center gap-1">
          <DriveLink href={driveFileUrl(item)} label="Open in Google Drive" className="p-2" />
          <DriveLink href={driveFolderUrl(item.folderId)} label="Open folder in Google Drive" className="p-2" />
          {href && (
            <a
              href={href}
              download={item.fileName}
              aria-label={`Download ${item.fileName}`}
              title="Download"
              className="shrink-0 rounded-md p-2 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
            >
              <Download size={18} aria-hidden />
            </a>
          )}
          {onDeleted && (
            <button
              type="button"
              onClick={() => {
                setDeleteError('');
                setConfirmDelete(true);
              }}
              aria-label={`Delete ${item.fileName}`}
              title="Delete"
              className="shrink-0 rounded-md p-2 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 size={18} aria-hidden />
            </button>
          )}
        </span>
      </p>
      {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
      {onDeleted && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this file?"
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={remove.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.mutate(item.id, {
              onSuccess: onDeleted,
              onError: (err) => setDeleteError(`Couldn't delete: ${err.message}`),
              onSettled: () => setConfirmDelete(false),
            })
          }
        >
          <strong className="font-medium text-slate-900 dark:text-slate-100">{item.title}</strong> will be removed from this entry and moved to the Drive trash. This can't be undone here.
        </ConfirmDialog>
      )}
    </div>
  );
}
