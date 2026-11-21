import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Download, FilePlus, GripVertical, LoaderCircle, X } from 'lucide-react';
import { IMAGE_MAX_BYTES, driveFileUrl, driveFolderUrl, MEDIA_DESCRIPTION_MAX, type Language, MEDIA_MAX_BYTES, MEDIA_TITLE_MAX, MEDIA_TYPES, VIDEO_MAX_BYTES, isMediaType, maxBytesFor, mediaBlock, mediaKind, mediaOf, type MediaItem, type MediaRole, type SectionDef } from '@profile/shared';
import { ApiError, fileType, useDeleteMedia, useHealth, useMedia, useReorderMedia, useUpdateMedia, useUploadMedia, type MediaDetails } from '../api';
import { credentialFormats } from '../credentialFiles';
import { moveKey, useDragSort } from '../dragSort';
import { useLanguage } from '../language';
import { inputClass } from './ComboInputs';
import { LanguageSwitch, ThaiMark } from './LanguageSwitch';
import { DriveLink, MediaPreview, MediaThumb, sharedFolder, sizeOfSource, useDownloadHref, type MediaSource } from './Media';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

/** Media added to an entry that isn't saved yet; uploaded right after the entry is created. */
export interface PendingMedia extends MediaDetails {
  key: string;
  file: File;
  /** On credentials: the certificate file itself, or other media. */
  role?: MediaRole;
}

interface Props {
  section: SectionDef;
  /** Saved entry: changes are stored at once. New entry (undefined): files wait in `pending`. */
  entryId?: string;
  pending: PendingMedia[];
  onPendingChange: (pending: PendingMedia[]) => void;
  /** Which block this is (see mediaBlock): a credential's own file, the detail files, or (unset) the media; shows only those files. */
  role?: MediaRole;
  /** Block heading; "Media" by default. */
  label?: string;
}

type Editing = { file: File } | { files: File[] } | { pending: PendingMedia } | { item: MediaItem } | { writing: true };

// Extensions too: some browsers give .mov files no type. Text is for detail files only.
const ACCEPT = [...Object.keys(MEDIA_TYPES).filter((t) => mediaKind(t) !== 'text'), '.mov', '.m4v'].join(',');
// A certificate or detail file is a scan or a PDF, never a video; a detail file can also be text.
const ACCEPT_DOCUMENT = 'image/jpeg,image/png,application/pdf';
const ACCEPT_DETAIL = `${ACCEPT_DOCUMENT},text/plain,.txt`;
const isDocumentRole = (role?: MediaRole) => role === 'credential' || role === 'detail';
const MB = 1024 * 1024;

function checkFile(file: File, role?: MediaRole): string {
  const type = fileType(file);
  const kind = isMediaType(type) ? mediaKind(type) : undefined;
  if (role === 'detail' && (!kind || kind === 'video')) return 'Only JPG, PNG, PDF or TXT files';
  if (role === 'credential' && (!kind || kind === 'video' || kind === 'text')) return 'Only JPG, PNG or PDF files';
  if (!kind || (kind === 'text' && role !== 'detail')) return 'Only JPG, PNG, PDF, MP4, MOV or WebM files';
  if (file.size > maxBytesFor(type)) return `${kind === 'video' ? 'Videos' : kind === 'text' ? 'Text files' : 'Images and PDFs'} can be at most ${maxBytesFor(type) / MB} MB`;
  return '';
}

/** "43%" while a video goes up in pieces; nothing before it has moved or for files sent in one go. */
const percent = (share: number | null | undefined) => (share && share < 1 ? `${Math.round(share * 100)}%` : '');

/**
 * A busy button's face: a spinner, plus how far along when that is known. `label` is what a screen reader hears
 * (and the tooltip), e.g. "Uploading 43%".
 */
function Busy({ label, progress }: { label: string; progress?: string }) {
  return (
    <span aria-label={label} title={label} className="inline-flex items-center justify-center gap-1.5">
      <LoaderCircle size={16} aria-hidden className="animate-spin" />
      {progress && (
        <span aria-hidden className="tabular-nums">
          {progress}
        </span>
      )}
    </span>
  );
}

/** Like LinkedIn: the file name without its extension. */
const defaultTitle = (file: File) => file.name.replace(/\.[^.]+$/, '').slice(0, MEDIA_TITLE_MAX);

let nextKey = 0;
/** Keys for files waiting to upload (outside the component, where the React Compiler allows a counter). */
const pendingKey = () => `pending-${nextKey++}`;

/** The "Media" block of an entry form: thumbnails, plus a dialog to add or edit one file's title and description (English and Thai). */
export default function MediaField({ section, entryId, pending, onPendingChange, role, label = 'Media' }: Props) {
  const { data = [] } = useMedia();
  const items = entryId ? mediaOf(data, entryId).filter((m) => mediaBlock(section, m) === mediaBlock(section, { role: role ?? '' })) : [];
  const health = useHealth();
  const unavailable = health.data?.media?.ok === false ? health.data.media.error : '';
  const upload = useUploadMedia();
  const update = useUpdateMedia();
  const remove = useDeleteMedia();
  const reorder = useReorderMedia();
  const [editing, setEditing] = useState<Editing | null>(null);
  // A stored file whose remove button was pressed, waiting for the confirmation.
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(false);
  const [uploadShare, setUploadShare] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Files picked or dropped: unsuitable ones are named and skipped; one file opens the editor, several the list. */
  function pick(list: FileList | File[] | null | undefined) {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    const ok = picked.filter((f) => !checkFile(f, role));
    setError(
      picked
        .filter((f) => checkFile(f, role))
        .map((f) => `${f.name}: ${checkFile(f, role)}`)
        .join(' · '),
    );
    if (ok.length === 1) setEditing({ file: ok[0] });
    else if (ok.length > 1) setEditing({ files: ok });
  }

  // A certificate goes up as PNG, JPG and PDF whichever it was, each with the same title and description.
  const filesFor = (file: File) => (role === 'credential' ? credentialFormats(file) : Promise.resolve([file]));
  const failure = (err: unknown) => (err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : (err as Error).message);

  /** Save several new files; returns the ones that failed with why, so they can be retried. */
  async function saveMany(rows: UploadRow[], progress: (done: number, share: number) => void): Promise<Record<string, string>> {
    const failed: Record<string, string> = {};
    const waiting: PendingMedia[] = [];
    for (const [i, r] of rows.entries()) {
      progress(i, 0);
      try {
        const files = await filesFor(r.file);
        const details = { title: r.title, description: r.description, description_th: r.description_th };
        if (!entryId) waiting.push(...files.map((file) => ({ key: pendingKey(), file, ...details })));
        else {
          for (const [j, file] of files.entries()) {
            await upload.mutateAsync({ section: section.key, entryId, ...details, file, role, onProgress: (share) => progress(i, (j + share) / files.length) });
          }
        }
      } catch (err) {
        failed[r.key] = failure(err);
      }
    }
    if (waiting.length) onPendingChange([...pending, ...waiting]);
    if (!Object.keys(failed).length) setEditing(null);
    return failed;
  }

  /** A new file: uploaded now on a saved entry, otherwise waiting until the entry is saved. */
  async function addFile(file: File, details: MediaDetails) {
    const files = await filesFor(file); // a failed conversion: the editor shows why
    if (!entryId) return onPendingChange([...pending, ...files.map((f) => ({ key: pendingKey(), file: f, ...details }))]);
    setUploadShare(0);
    try {
      for (const [i, f] of files.entries()) {
        await upload.mutateAsync({ section: section.key, entryId, ...details, file: f, role, onProgress: (share) => setUploadShare((i + share) / files.length) });
      }
    } catch (err) {
      setUploadShare(null);
      throw err; // the editor shows it
    }
    setUploadShare(null);
  }

  async function save(details: MediaDetails) {
    if (!editing) return;
    if ('file' in editing) {
      await addFile(editing.file, details);
    } else if ('pending' in editing) {
      onPendingChange(pending.map((p) => (p.key === editing.pending.key ? { ...p, ...details } : p)));
    } else if ('item' in editing) {
      await update.mutateAsync({ id: editing.item.id, ...details });
    }
    setEditing(null);
  }

  async function del() {
    if (!editing) return;
    if ('pending' in editing) onPendingChange(pending.filter((p) => p.key !== editing.pending.key));
    else if ('item' in editing) await remove.mutateAsync(editing.item.id);
    setEditing(null);
  }

  // Stored files and files waiting to upload are ordered separately (the waiting ones go after).
  const tiles: { key: string; group: 'stored' | 'pending'; source: MediaSource; title: string; edit: Editing; note?: string }[] = [
    ...items.map((item) => ({ key: item.id, group: 'stored' as const, source: { item }, title: item.title, edit: { item } })),
    ...pending.map((p) => ({ key: p.key, group: 'pending' as const, source: { file: p.file }, title: p.title, edit: { pending: p }, note: 'Uploads when saved' })),
  ];

  /** Save a new order for one group (all stored files, or all waiting ones). */
  function sort(keys: string[]) {
    if (items.some((m) => m.id === keys[0])) reorder.mutate({ entryId: entryId!, ids: keys });
    else onPendingChange(keys.map((k) => pending.find((p) => p.key === k)!));
  }
  const sorting = useDragSort([items.map((m) => m.id), pending.map((p) => p.key)], sort);
  const shown = sorting.arrange(tiles, (t) => t.key);

  /** Swap with the previous (-1) or next (+1) tile of the same group. */
  function step(key: string, by: -1 | 1) {
    const keys = tiles.filter((t) => t.group === tiles.find((x) => x.key === key)?.group).map((t) => t.key);
    const target = keys[keys.indexOf(key) + by];
    if (target) sort(moveKey(keys, key, target));
  }

  return (
    <fieldset
      // Files can be dropped anywhere on the block (dragging a thumbnail to reorder it is handled by useDragSort).
      onDragOver={(e) => {
        if (unavailable || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (unavailable || !e.dataTransfer.files.length) return;
        e.preventDefault();
        pick(e.dataTransfer.files);
      }}
      className={`rounded-md ${dropping ? 'outline-2 outline-offset-4 outline-blue-500 outline-dashed' : ''}`}
    >
      <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium text-slate-700 dark:text-slate-300">
        <span className="inline-flex items-baseline gap-2">
          {label}
          <DriveLink href={driveFolderUrl(sharedFolder(items))} label={`Open the ${label.toLowerCase()} folder in Google Drive`} text="Drive" className="px-1 text-xs font-normal" />
        </span>
        <span className="text-xs font-normal text-slate-400">
          {role === 'credential'
            ? `The certificate itself: JPG, PNG or PDF up to ${IMAGE_MAX_BYTES / MB} MB, saved in all three formats (a PDF's images show its first page) · several pages at once, or drop them here`
            : role === 'detail'
              ? `What details it (agenda, brochure, outline): JPG, PNG or PDF up to ${IMAGE_MAX_BYTES / MB} MB, TXT up to ${MEDIA_MAX_BYTES / MB} MB · several at once, or drop them here, or write a new text file`
              : `Images and PDFs up to ${IMAGE_MAX_BYTES / MB} MB · MP4, MOV or WebM videos up to ${VIDEO_MAX_BYTES / MB} MB · several at once, or drop them here`}
        </span>
      </legend>
      {unavailable && <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">Media storage isn't set up on the server: {unavailable}</p>}
      <div className="flex flex-wrap gap-3">
        {shown.map((t) => {
          const group = shown.filter((x) => x.group === t.group);
          const index = group.indexOf(t);
          const arrow = 'flex-1 rounded py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800';
          return (
            <div
              key={t.key}
              {...sorting.handle(t.key)}
              title={group.length > 1 ? 'Drag to reorder' : undefined}
              className={`relative w-24 space-y-1 select-none [-webkit-touch-callout:none] ${group.length > 1 ? 'cursor-grab' : ''} ${
                sorting.dragging === t.key ? 'relative z-10 scale-105 cursor-grabbing rounded-md opacity-90 shadow-lg ring-2 ring-blue-500' : ''
              }`}
            >
              <button type="button" onClick={() => setEditing(t.edit)} className="block w-full space-y-1 rounded-md text-left hover:opacity-80">
                <MediaThumb source={t.source} title={t.title} className="h-24 w-24" />
                <span className="block text-xs wrap-anywhere text-slate-700 dark:text-slate-300">{t.title}</span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">{sizeOfSource(t.source)}</span>
                {t.note && <span className="block text-[10px] text-slate-500 dark:text-slate-400">{t.note}</span>}
              </button>
              {/* Always shown, not on hover: phones have none. A file waiting to upload goes at once; a stored one asks first. */}
              <button
                type="button"
                aria-label={`Remove “${t.title}”`}
                title="Remove"
                onPointerDown={(e) => e.stopPropagation()} // not the start of a drag
                onClick={() => {
                  if ('pending' in t.edit) onPendingChange(pending.filter((p) => p.key !== t.key));
                  else if ('item' in t.edit) setRemoving(t.edit.item);
                }}
                className="absolute top-1 right-1 z-[1] rounded-full bg-slate-950/60 p-1 text-white hover:bg-red-600 dark:bg-slate-950/70 dark:hover:bg-red-600"
              >
                <X size={12} strokeWidth={2.5} aria-hidden />
              </button>
              {group.length > 1 && (
                <div className="flex gap-1">
                  <button type="button" aria-label={`Move “${t.title}” earlier`} disabled={index === 0} onClick={() => step(t.key, -1)} className={arrow}>
                    ◀
                  </button>
                  <button type="button" aria-label={`Move “${t.title}” later`} disabled={index === group.length - 1} onClick={() => step(t.key, 1)} className={arrow}>
                    ▶
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={!!unavailable}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span className="text-xl leading-none">+</span>
          {role === 'detail' ? 'Add files' : 'Add media'}
        </button>
        {role === 'detail' && (
          <button
            type="button"
            onClick={() => setEditing({ writing: true })}
            disabled={!!unavailable}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-center text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <FilePlus size={20} aria-hidden />
            New text file
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={role === 'detail' ? ACCEPT_DETAIL : isDocumentRole(role) ? ACCEPT_DOCUMENT : ACCEPT}
          multiple
          aria-label={role === 'credential' ? `Choose ${label.toLowerCase().replace(/ file$/, '')} files` : role === 'detail' ? 'Choose detail files' : 'Choose media files'}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = ''; // picking the same file again should still fire
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this file?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          remove.mutate(removing!.id, {
            onError: (err) => setError(`Couldn't delete ${removing!.title}: ${err.message}`),
            onSettled: () => setRemoving(null),
          })
        }
      >
        <strong className="font-medium text-slate-900 dark:text-slate-100">{removing?.title}</strong> will be moved to the Drive trash. This can't be undone here.
      </ConfirmDialog>

      <Modal
        open={editing !== null}
        // A file waiting to upload is already added: opening it again edits it.
        title={editing && ('item' in editing || 'pending' in editing) ? 'Edit media' : editing && 'files' in editing ? `Add ${editing.files.length} files` : editing && 'writing' in editing ? 'New text file' : 'Add media'}
        back={!!editing && !('item' in editing) && !('pending' in editing)}
        onRequestClose={() => setEditing(null)}
      >
        {editing && 'files' in editing && <MultiUpload files={editing.files} uploading={!!entryId} onSave={saveMany} onCancel={() => setEditing(null)} />}
        {editing && 'writing' in editing && (
          <TextFileWriter
            savingLabel={entryId ? 'Uploading' : 'Adding'}
            onSave={async (file, details) => {
              await addFile(file, details);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
        {editing && !('files' in editing) && !('writing' in editing) && (
          <MediaEditor
            key={'item' in editing ? editing.item.id : 'pending' in editing ? editing.pending.key : 'new'}
            source={'item' in editing ? { item: editing.item } : { file: 'file' in editing ? editing.file : editing.pending.file }}
            initial={'item' in editing ? editing.item : 'pending' in editing ? editing.pending : { title: defaultTitle(editing.file), description: '', description_th: '' }}
            savingLabel={'file' in editing && entryId ? `Uploading ${percent(uploadShare)}`.trim() : 'Saving'}
            savingProgress={'file' in editing && entryId ? percent(uploadShare) : ''}
            onSave={save}
            onDelete={'file' in editing ? undefined : del}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </fieldset>
  );
}

/**
 * Write a new text file (notes, an outline) as a detail file: a title, which also names the file, and the text. It
 * is saved like an uploaded .txt file.
 */
function TextFileWriter({ savingLabel, onSave, onCancel }: { savingLabel: string; onSave: (file: File, details: MediaDetails) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // the dialog is portaled, but React still bubbles submit to the entry form
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = 'Title is required';
    else if (title.trim().length > MEDIA_TITLE_MAX) found.title = `At most ${MEDIA_TITLE_MAX} characters`;
    if (!text.trim()) found.text = 'Write something first';
    const file = new File([text], `${title.trim() || 'Note'}.txt`, { type: 'text/plain' });
    if (file.size > MEDIA_MAX_BYTES) found.text = `Text files can be at most ${MEDIA_MAX_BYTES / MB} MB`;
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSave(file, { title: title.trim(), description: '', description_th: '' });
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : (err as Error).message });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <div>
          <label htmlFor={`${id}-title`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Title<span className="text-red-500"> *</span>
          </label>
          <input id={`${id}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Agenda" autoFocus />
          {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-text`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Text<span className="text-red-500"> *</span>
          </label>
          <textarea id={`${id}-text`} rows={12} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
          {errors.text && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.text}</p>}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Saved as a .txt file with the entry's detail files.</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
        {errors.form && <p className="text-sm text-red-600 dark:text-red-400">{errors.form}</p>}
        <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-w-20 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-100"
          >
            {busy ? <Busy label={savingLabel} /> : 'Add'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

interface UploadRow extends MediaDetails {
  key: string;
  file: File;
}

/** Title and description for several new files at once. Rows that fail stay, with their error. */
function MultiUpload({
  files,
  uploading,
  onSave,
  onCancel,
}: {
  files: File[];
  /** Uploads now (saved entry) rather than adding them to the entry's waiting list. */
  uploading: boolean;
  onSave: (rows: UploadRow[], progress: (done: number, share: number) => void) => Promise<Record<string, string>>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<UploadRow[]>(() => files.map((file, i) => ({ key: `row-${i}`, file, title: defaultTitle(file), description: '', description_th: '' })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Which file is uploading, and how much of it (videos report as they go). */
  const [progress, setProgress] = useState<{ index: number; share: number } | null>(null);
  const id = useId();
  // Which description the rows edit, as in the entry form; starts in the language the profile is shown in.
  const profileLanguage = useLanguage();
  const [lang, setLang] = useState<Language>(profileLanguage);
  const total = rows.length;
  const set = (key: string, patch: Partial<UploadRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // They upload (or wait) in this order, which is the order they then have on the entry.
  const reorder = (keys: string[]) => setRows((rs) => keys.map((k) => rs.find((r) => r.key === k)!));
  const sorting = useDragSort([rows.map((r) => r.key)], reorder);
  const shown = sorting.arrange(rows, (r) => r.key);
  const step = (key: string, by: -1 | 1) => {
    const keys = rows.map((r) => r.key);
    const target = keys[keys.indexOf(key) + by];
    if (target) reorder(moveKey(keys, key, target));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // the dialog is portaled, but React still bubbles submit to the entry form
    const missing = Object.fromEntries(rows.filter((r) => !r.title.trim()).map((r) => [r.key, 'Title is required']));
    const long = Object.fromEntries(rows.filter((r) => r.title.trim().length > MEDIA_TITLE_MAX || [r.description, r.description_th].some((d) => d.trim().length > MEDIA_DESCRIPTION_MAX)).map((r) => [r.key, 'Title or description is too long']));
    if (Object.keys({ ...missing, ...long }).length) return setErrors({ ...long, ...missing });
    setErrors({});
    setProgress({ index: 0, share: 0 });
    const failed = await onSave(
      rows.map((r) => ({ ...r, title: r.title.trim(), description: r.description.trim(), description_th: r.description_th.trim() })),
      (index, share) => setProgress({ index, share }),
    );
    setProgress(null);
    setRows((rs) => rs.filter((r) => failed[r.key]));
    setErrors(failed);
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LanguageSwitch value={lang} onChange={setLang} label="Language to edit" names="full" />
          <span className="text-xs text-slate-500 dark:text-slate-400">{lang === 'en' ? 'Descriptions also have a Thai version.' : 'Thai descriptions. Left empty, the English one is shown.'}</span>
        </div>
        {total > 1 && <p className="text-xs text-slate-500 dark:text-slate-400">Drag the handles (or use the arrows) to put them in order.</p>}
        <ul className="space-y-4">
          {shown.map((r, i) => {
            // The handle starts a drag, so typing in the fields below doesn't.
            const { 'data-sort-key': sortKey, ...grip } = sorting.handle(r.key);
            return (
              <li
                key={r.key}
                data-sort-key={sortKey}
                className={`flex gap-3 rounded-md ${sorting.dragging === r.key ? 'relative z-10 bg-white opacity-90 shadow-lg ring-2 ring-blue-500 dark:bg-slate-900' : ''}`}
              >
                {total > 1 && (
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    {/* For the pointer only; the arrows below do the same from the keyboard. */}
                    <span
                      {...grip}
                      aria-hidden
                      title="Drag to reorder"
                      className="cursor-grab touch-none rounded p-1 text-slate-400 select-none hover:bg-slate-100 active:cursor-grabbing dark:text-slate-500 dark:hover:bg-slate-800"
                    >
                      <GripVertical size={18} aria-hidden />
                    </span>
                    <button type="button" aria-label={`Move “${r.title || r.file.name}” up`} disabled={i === 0} onClick={() => step(r.key, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800">
                      <ChevronUp size={16} aria-hidden />
                    </button>
                    <button type="button" aria-label={`Move “${r.title || r.file.name}” down`} disabled={i === total - 1} onClick={() => step(r.key, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800">
                      <ChevronDown size={16} aria-hidden />
                    </button>
                  </div>
                )}
                <MediaThumb source={{ file: r.file }} title={r.title} className="h-20 w-20" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`${id}-${r.key}-title`} className="min-w-0 text-xs wrap-anywhere text-slate-500 dark:text-slate-400">
                      Title for {r.file.name}
                    </label>
                    <span className="mr-auto shrink-0 text-xs text-slate-400">{sizeOfSource({ file: r.file })}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${r.file.name}`}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="shrink-0 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400"
                    >
                      Remove
                    </button>
                  </div>
                  <input id={`${id}-${r.key}-title`} className={inputClass} value={r.title} onChange={(e) => set(r.key, { title: e.target.value })} autoFocus={i === 0} />
                  {lang === 'en' ? (
                    <textarea
                      aria-label={`Description for ${r.file.name}`}
                      placeholder="Description (optional)"
                      rows={2}
                      className={inputClass}
                      value={r.description}
                      onChange={(e) => set(r.key, { description: e.target.value })}
                    />
                  ) : (
                    <textarea
                      aria-label={`Thai description for ${r.file.name}`}
                      lang="th"
                      // The English to translate from.
                      placeholder={r.description.trim() || 'Description in Thai (optional)'}
                      rows={2}
                      className={inputClass}
                      value={r.description_th}
                      onChange={(e) => set(r.key, { description_th: e.target.value })}
                    />
                  )}
                  {errors[r.key] && <p className="text-xs text-red-600 dark:text-red-400">{errors[r.key]}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] *:flex-1 sm:*:flex-none dark:border-slate-800">
        <button
          type="submit"
          disabled={progress !== null || !total}
          className={`inline-flex min-w-24 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 ${progress !== null ? 'disabled:opacity-100' : ''}`}
        >
          {progress !== null ? (
            // "2/3", then "2/3 43%" while a video goes up.
            <Busy
              label={`Uploading file ${progress.index + 1} of ${total} ${percent(progress.share)}`.trim()}
              progress={[total > 1 ? `${progress.index + 1}/${total}` : '', percent(progress.share)].filter(Boolean).join(' ')}
            />
          ) : uploading
              ? `Upload ${total} files`
              : `Add ${total} files`}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface EditorProps {
  source: MediaSource;
  initial: MediaDetails;
  /** What the busy Save button says to a screen reader, e.g. "Uploading 43%". */
  savingLabel: string;
  /** Shown beside its spinner, e.g. "43%". */
  savingProgress?: string;
  onSave: (details: MediaDetails) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

function MediaEditor({ source, initial, savingLabel, savingProgress, onSave, onDelete, onCancel }: EditorProps) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [descriptionTh, setDescriptionTh] = useState(initial.description_th ?? '');
  // Which description is edited, as in the entry form; starts in the language the profile is shown in.
  const profileLanguage = useLanguage();
  const [lang, setLang] = useState<Language>(profileLanguage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = useId();

  async function run(kind: 'save' | 'delete', action: () => Promise<void>) {
    setBusy(kind);
    setErrors({});
    setFormError('');
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        // Show the description that was refused.
        if (err.fields.description) setLang('en');
        else if (err.fields.description_th) setLang('th');
        // Title, descriptions and file errors show under their fields; say what anything else was.
        setFormError(
          Object.entries(err.fields)
            .filter(([k]) => !['title', 'description', 'description_th', 'file'].includes(k))
            .map(([, m]) => m)
            .join(' · '),
        );
      } else {
        setFormError((err as Error).message);
      }
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // the dialog is portaled, but React still bubbles submit to the entry form
    if (!title.trim()) return setErrors({ title: 'Title is required' });
    void run('save', () => onSave({ title: title.trim(), description: description.trim(), description_th: descriptionTh.trim() }));
  }

  const counter = (value: string, max: number) => (
    <span className={`text-xs ${value.length > max ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
      {value.length}/{max}
    </span>
  );

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <MediaPreview source={source} title={title} />
        <p className="-mt-2 text-xs break-all text-slate-500 dark:text-slate-400">
          {['item' in source ? source.item.fileName : source.file.name, sizeOfSource(source)].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LanguageSwitch value={lang} onChange={setLang} label="Language to edit" names="full" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {lang === 'en' ? 'The description also has a Thai version. The title is the same in both: it names the file.' : 'The Thai description. Left empty, the English one is shown.'}
          </span>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor={`${id}-title`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Title<span className="text-red-500"> *</span>
            </label>
            {counter(title, MEDIA_TITLE_MAX)}
          </div>
          <input id={`${id}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>}
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor={`${id}-description-${lang}`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description
              <ThaiMark editing={lang} />
            </label>
            {counter(lang === 'en' ? description : descriptionTh, MEDIA_DESCRIPTION_MAX)}
          </div>
          {lang === 'en' ? (
            <textarea id={`${id}-description-en`} rows={4} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          ) : (
            <textarea id={`${id}-description-th`} lang="th" rows={4} className={inputClass} value={descriptionTh} onChange={(e) => setDescriptionTh(e.target.value)} />
          )}
          {/* As in the entry form: the English stays in view while it's translated. */}
          {lang === 'th' && description.trim() && (
            <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer">English</summary>
              <p className="mt-1 whitespace-pre-line">{description.trim()}</p>
            </details>
          )}
          {errors[lang === 'en' ? 'description' : 'description_th'] && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[lang === 'en' ? 'description' : 'description_th']}</p>
          )}
        </div>
        {errors.file && <p className="text-sm text-red-600 dark:text-red-400">{errors.file}</p>}
      </div>
      <div className="space-y-3 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
          <button
            type="submit"
            disabled={!!busy}
            className={`inline-flex min-w-20 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 ${busy === 'save' ? 'disabled:opacity-100' : ''}`}
          >
            {busy === 'save' ? <Busy label={savingLabel} progress={savingProgress} /> : 'Save'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
          {'item' in source && <DriveLink href={driveFileUrl(source.item)} label="Open in Google Drive" className="flex-none! justify-center px-3 py-2" />}
          {'item' in source && <DownloadLink item={source.item} />}
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md px-4 py-2 text-sm text-red-700 hover:bg-red-50 sm:ml-auto dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {onDelete && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this file?"
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          // On success the editor closes; on failure the error shows in the editor.
          onConfirm={() => void run('delete', onDelete).finally(() => setConfirmDelete(false))}
        >
          This can't be undone.
        </ConfirmDialog>
      )}
    </form>
  );
}

function DownloadLink({ item }: { item: MediaItem }) {
  const href = useDownloadHref(item);
  if (!href) return null;
  return (
    <a
      href={href}
      download={item.fileName}
      aria-label={`Download ${item.fileName}`}
      title="Download"
      className="flex flex-none! items-center justify-center rounded-md px-3 py-2 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
    >
      <Download size={18} aria-hidden />
    </a>
  );
}
