import { useRef, useState } from 'react';
import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import { MEDIA_MAX_BYTES, PROFILE_IMAGES, mediaOf, type Entry, type MediaItem, type ProfileImage, type SectionDef } from '@profile/shared';
import { ApiError, fileType, useDeleteMedia, useHealth, useMedia, useUploadMedia } from '../api';
import { useLanguage, useLocalize } from '../language';
import { useMediaSrc, type MediaSource } from './Media';
import ConfirmDialog from './ConfirmDialog';

/** Photos picked before the About entry is saved; they upload once it is (see AboutPage). */
export type PendingImages = Partial<Record<ProfileImage, File>>;

interface Props {
  section: SectionDef;
  about: Entry | null;
  pending: PendingImages;
  onPendingChange: (pending: PendingImages) => void;
}

/**
 * The About page's header, like LinkedIn's: a background (banner) image with the round profile photo over its
 * lower edge, then the name and headline. Each image has its own change and remove buttons. Before About is
 * saved, picked photos are only previewed here and upload when it is.
 */
export default function ProfileHeader({ section, about, pending, onPendingChange }: Props) {
  const { data: media = [] } = useMedia();
  const health = useHealth();
  const [error, setError] = useState('');
  const items = about ? mediaOf(media, about.id) : [];
  const stored = (role: ProfileImage) => items.find((m) => m.role === role);
  // What each image shows: a photo waiting to upload, else the stored one.
  const source = (role: ProfileImage): MediaSource | undefined => {
    const file = pending[role];
    const item = stored(role);
    return file ? { file } : item ? { item } : undefined;
  };
  const photo = source('photo');
  const banner = source('banner');
  const unavailable = health.data?.media?.ok === false ? `Media storage isn't set up on the server: ${health.data.media.error}` : '';
  const slot = { section, about, pending, onPendingChange, unavailable, onError: setError };
  // Name, headline and location in the language the profile is shown in; initials from the English name.
  const lang = useLanguage();
  const localize = useLocalize();
  const shown = about && localize(section, about);
  const initials = (about?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="relative aspect-[4/1] min-h-24 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700">
        {banner && <Picture source={banner} alt={PROFILE_IMAGES.banner.title} className="h-full w-full object-cover" />}
        <ImageButtons role="banner" item={stored('banner')} {...slot} className="absolute top-2 right-2" />
      </div>
      <div className="px-5 pb-5">
        <div className="relative -mt-12 w-fit sm:-mt-16">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-200 text-2xl font-semibold text-slate-500 sm:h-32 sm:w-32 sm:text-3xl dark:border-slate-900 dark:bg-slate-700 dark:text-slate-300">
            {photo ? <Picture source={photo} alt={PROFILE_IMAGES.photo.title} className="h-full w-full object-cover" /> : <span aria-hidden>{initials}</span>}
          </div>
          <ImageButtons role="photo" item={stored('photo')} {...slot} className="absolute -right-2 bottom-0" />
        </div>
        <div lang={lang}>
          {shown?.name && <h2 className="mt-3 text-xl font-semibold">{shown.name}</h2>}
          {shown?.headline && <p className="text-sm text-slate-700 dark:text-slate-300">{shown.headline}</p>}
          {shown?.location && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shown.location}</p>}
        </div>
        {unavailable && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{unavailable}</p>}
        {Object.keys(pending).length > 0 && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Your photos upload when you save.</p>}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Picture({ source, alt, className }: { source: MediaSource; alt: string; className: string }) {
  const src = useMediaSrc(source);
  return src ? <img src={src} alt={alt} className={className} /> : <span className={`block animate-pulse bg-slate-300/60 dark:bg-slate-600/60 ${className}`} />;
}

interface SlotProps {
  role: ProfileImage;
  /** The stored image, if any. */
  item: MediaItem | undefined;
  section: SectionDef;
  about: Entry | null;
  pending: PendingImages;
  onPendingChange: (pending: PendingImages) => void;
  unavailable: string;
  onError: (message: string) => void;
  className: string;
}

/** Add / change (camera) and remove (bin) for one image. */
function ImageButtons({ role, item, section, about, pending, onPendingChange, unavailable, onError, className }: SlotProps) {
  const upload = useUploadMedia();
  const remove = useDeleteMedia();
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const { title, size } = PROFILE_IMAGES[role];
  const name = title.toLowerCase();
  const busy = upload.isPending || remove.isPending;
  const waiting = pending[role];
  const shown = !!waiting || !!item;
  const button = 'flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white disabled:opacity-50 dark:bg-slate-800/90 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800';

  async function pick(file: File | undefined) {
    if (!file) return;
    onError('');
    if (!['image/jpeg', 'image/png'].includes(fileType(file))) return onError(`${title}: use a JPG or PNG image`);
    if (file.size > MEDIA_MAX_BYTES) return onError(`${title}: images can be at most ${MEDIA_MAX_BYTES / 1024 / 1024} MB`);
    // Not saved yet (or an earlier upload failed): keep it to upload on save.
    if (!about || waiting) return onPendingChange({ ...pending, [role]: file });
    try {
      await upload.mutateAsync({ section: section.key, entryId: about.id, title, description: '', file, role });
    } catch (err) {
      onError(`Couldn't upload the ${name}: ${err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : (err as Error).message}`);
    }
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!unavailable || busy}
        aria-label={shown ? `Change ${name}` : `Add ${name}`}
        title={`${shown ? 'Change' : 'Add'} ${name} (${size} px works best)`}
        className={button}
      >
        {upload.isPending ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Camera size={16} aria-hidden />}
      </button>
      {shown && (
        <button
          type="button"
          // One waiting to upload is just dropped; a stored one is trashed after asking.
          onClick={() => (waiting ? onPendingChange(Object.fromEntries(Object.entries(pending).filter(([r]) => r !== role))) : setConfirming(true))}
          disabled={busy}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          className={button}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={`Choose ${name}`}
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = ''; // picking the same file again should still fire
        }}
      />
      <ConfirmDialog
        open={confirming}
        title={`Remove your ${name}?`}
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!item) return;
          onError('');
          remove.mutate(item.id, {
            onError: (err) => onError(`Couldn't remove the ${name}: ${err.message}`),
            onSettled: () => setConfirming(false),
          });
        }}
      >
        It moves to the trash in Drive.
      </ConfirmDialog>
    </div>
  );
}
