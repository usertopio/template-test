import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { mediaOf, splitList, type Entry, type MediaItem, type SectionDef } from '@profile/shared';
import { useMedia, useSaveEntry } from '../api';
import { useMediaDownload } from '../download';
import SectionPage from '../components/SectionPage';
import { useLocalize } from '../language';

/**
 * Post text ready to paste into LinkedIn: content followed by hashtags. Hashtags the content already ends with (or
 * mentions) aren't added again, so a post written with its hashtags in place copies them once.
 */
export function linkedInText(post: Entry): string {
  const written = new Set((post.content?.match(/#[^\s#]+/g) ?? []).map((t) => t.toLowerCase()));
  const tags = splitList(post.hashtags)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t) => !written.has(t.toLowerCase()));
  return [post.content, tags.join(' ')].filter(Boolean).join('\n\n');
}

export default function PostsPage({ section }: { section: SectionDef }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const save = useSaveEntry(section.key);
  // Copied in the language the profile is shown in.
  const localize = useLocalize();
  const [markError, setMarkError] = useState<{ id: string; message: string } | null>(null);
  const { data: media = [] } = useMedia();
  const files = useMediaDownload();

  async function copy(post: Entry) {
    await navigator.clipboard.writeText(linkedInText(localize(section, post)));
    setCopiedId(post.id);
    setTimeout(() => setCopiedId((id) => (id === post.id ? null : id)), 1500);
  }

  return (
    <SectionPage
      section={section}
      actions={(post) => (
        <>
          <button onClick={() => copy(post)} className="rounded px-3 py-2 md:px-2 md:py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
            {copiedId === post.id ? 'Copied!' : 'Copy for LinkedIn'}
          </button>
          {post.status !== 'posted' && (
            <button
              onClick={() => {
                setMarkError(null);
                save.mutate(
                  { id: post.id, data: { ...post, status: 'posted', postedDate: post.postedDate || new Date().toISOString().slice(0, 10) } },
                  // e.g. a field edited by hand in the sheet no longer passes the checks: Edit shows which
                  { onError: (err) => setMarkError({ id: post.id, message: `Couldn't mark as posted: ${err.message}` }) },
                );
              }}
              disabled={save.isPending}
              className="rounded px-3 py-2 md:px-2 md:py-1 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50"
            >
              Mark as posted
            </button>
          )}
          <DownloadPicked post={post} media={media} files={files} />
          {files.error?.key === post.id && (
            <span role="alert" className="basis-full px-1 text-sm text-red-600 dark:text-red-400">
              {files.error.message}
            </span>
          )}
          {markError?.id === post.id && (
            <span role="alert" className="basis-full px-1 text-sm text-red-600 dark:text-red-400">
              {markError.message}
            </span>
          )}
          {post.postUrl && (
            <a href={post.postUrl} target="_blank" rel="noreferrer" className="rounded px-3 py-2 md:px-2 md:py-1 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10">
              Open post ↗
            </a>
          )}
        </>
      )}
    />
  );
}

/**
 * The post's media ready to upload to LinkedIn: its own files (uploaded to it, e.g. a video) in their order, then
 * those picked from other entries (see FieldType 'media'). One file as it is, several as a .zip numbered in that
 * order, so they go up in it.
 */
function DownloadPicked({ post, media, files }: { post: Entry; media: MediaItem[]; files: ReturnType<typeof useMediaDownload> }) {
  const picked = [...mediaOf(media, post.id), ...splitList(post.mediaIds).flatMap((id) => media.filter((m) => m.id === id))];
  if (!picked.length) return null;
  const progress = files.progress?.key === post.id ? files.progress : null;
  const label = progress ? `Preparing ${progress.done} of ${progress.total}` : picked.length === 1 ? 'Download media' : `Download all ${picked.length} media files`;
  const paths = picked.map((item, i) => ({ path: `${String(i + 1).padStart(2, '0')} ${item.fileName || item.title}`, item }));
  return (
    <button
      onClick={() => files.download(paths, `${post.title || 'Post'} - Media.zip`, post.id)}
      disabled={!!files.progress}
      aria-label={label}
      title={progress || picked.length === 1 ? label : `${label} (.zip)`}
      className={`inline-flex items-center gap-1 rounded px-3 py-2 md:px-2 md:py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 ${progress ? 'disabled:opacity-100' : ''}`}
    >
      {progress ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Download size={16} aria-hidden />}
      <span aria-hidden className="tabular-nums">{progress && progress.total > 1 ? `${progress.done}/${progress.total}` : `Media ${picked.length}`}</span>
    </button>
  );
}
