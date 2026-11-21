import { useRef, useState } from 'react';
import { Building, ImageUp, LoaderCircle, Trash2 } from 'lucide-react';
import { MEDIA_MAX_BYTES, ORGANIZATIONS, logoOf, orgKey, type SectionDef } from '@profile/shared';
import { ApiError, fileType, useDeleteMedia, useEntries, useHealth, useMedia, useMediaThumbUrl, useUploadMedia } from '../api';
import { useMediaSrc, type MediaSource } from './Media';
import ConfirmDialog from './ConfirmDialog';
import type { PendingMedia } from './MediaField';

// Organization logos (see MediaConfig.logo): shown before an organization's name wherever it's named, and set in
// the organization's form.

/**
 * A logo, whole (not cropped) on a white tile, since logos are mostly drawn for a white page. A stored one shows
 * Drive's small thumbnail, or the file itself until Drive has made one.
 */
export function LogoImage({ source, alt, className = 'h-5 w-5' }: { source: MediaSource; alt: string; className?: string }) {
  const item = 'item' in source ? source.item : undefined;
  const thumb = useMediaThumbUrl(item?.id ?? '', !!item);
  const src = useMediaSrc(source, !item || thumb.isError);
  const url = thumb.data ?? src;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white ring-1 ring-slate-200 dark:ring-slate-700 ${className}`}>
      {url ? <img src={url} alt={alt} className="h-full w-full object-contain" /> : <span className="h-1/2 w-1/2 animate-pulse rounded-full bg-slate-200" />}
    </span>
  );
}

/**
 * The logo of the organization with this (stored, English) name. Without one: nothing, or with `placeholder` a
 * faint building, so names in a column still line up.
 */
export function OrgLogo({ name, className = 'h-5 w-5', placeholder = false }: { name: string; className?: string; placeholder?: boolean }) {
  const { data: organizations = [] } = useEntries(ORGANIZATIONS);
  const { data: media = [] } = useMedia();
  const organization = organizations.find((o) => orgKey(o.name) === orgKey(name));
  const logo = logoOf(media, organization?.id);
  // Decorative: the name is right beside it.
  if (logo) return <LogoImage source={{ item: logo }} alt="" className={className} />;
  return placeholder ? (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center text-blue-300 dark:text-blue-500/50 ${className}`}>
      <Building size={14} />
    </span>
  ) : null;
}

interface FieldProps {
  section: SectionDef;
  /** Saved organization: the logo is stored at once. New one (undefined): it waits in `pending`. */
  entryId?: string;
  pending: PendingMedia[];
  onPendingChange: (pending: PendingMedia[]) => void;
}

/** The organization form's Logo block: the logo, with Upload (or Change) and Remove. */
export function LogoField({ section, entryId, pending, onPendingChange }: FieldProps) {
  const { data: media = [] } = useMedia();
  const health = useHealth();
  const upload = useUploadMedia();
  const remove = useDeleteMedia();
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(false);
  const stored = logoOf(media, entryId);
  const waiting = pending[0];
  const source: MediaSource | undefined = waiting ? { file: waiting.file } : stored ? { item: stored } : undefined;
  const unavailable = health.data?.media?.ok === false ? `Media storage isn't set up on the server: ${health.data.media.error}` : '';
  const busy = upload.isPending || remove.isPending;
  const button = 'inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png'].includes(fileType(file))) return setError('Use a JPG or PNG image');
    if (file.size > MEDIA_MAX_BYTES) return setError(`Images can be at most ${MEDIA_MAX_BYTES / 1024 / 1024} MB`);
    // Not saved yet: upload it right after the organization is.
    if (!entryId) return onPendingChange([{ key: 'logo', file, title: 'Logo', description: '', description_th: '', role: 'logo' }]);
    try {
      await upload.mutateAsync({ section: section.key, entryId, title: 'Logo', description: '', file, role: 'logo' });
    } catch (err) {
      setError(`Couldn't upload the logo: ${err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : (err as Error).message}`);
    }
  }

  return (
    <fieldset
      // An image can be dropped anywhere on the block, as on the Media block.
      onDragOver={(e) => {
        if (unavailable || busy || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (unavailable || busy || !e.dataTransfer.files.length) return;
        e.preventDefault();
        void pick(e.dataTransfer.files[0]);
      }}
      className={`space-y-2 rounded-md ${dropping ? 'outline-2 outline-offset-4 outline-blue-500 outline-dashed' : ''}`}
    >
      <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Logo</legend>
      <div className="flex flex-wrap items-center gap-3">
        {source ? (
          <LogoImage source={source} alt="Logo" className="h-16 w-16" />
        ) : (
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <Building size={24} />
          </span>
        )}
        <button type="button" onClick={() => input.current?.click()} disabled={!!unavailable || busy} className={button}>
          {upload.isPending ? <LoaderCircle size={14} aria-hidden className="animate-spin" /> : <ImageUp size={14} aria-hidden />}
          {source ? 'Change logo' : 'Upload logo'}
        </button>
        {source && (
          <button
            type="button"
            // One waiting to upload is just dropped; a stored one is trashed after asking.
            onClick={() => (waiting ? onPendingChange([]) : setConfirming(true))}
            disabled={busy}
            className={`${button} text-red-700 dark:text-red-400`}
          >
            <Trash2 size={14} aria-hidden />
            Remove
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Choose logo"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = ''; // picking the same file again should still fire
          }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {waiting ? 'The logo uploads when you save.' : 'JPG or PNG, or drop it here. A square image works best. It shows before the name wherever the organization is named.'}
      </p>
      {(error || unavailable) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error || unavailable}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title="Remove the logo?"
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!stored) return;
          setError('');
          remove.mutate(stored.id, {
            onError: (err) => setError(`Couldn't remove the logo: ${err.message}`),
            onSettled: () => setConfirming(false),
          });
        }}
      >
        It moves to the trash in Drive.
      </ConfirmDialog>
    </fieldset>
  );
}
