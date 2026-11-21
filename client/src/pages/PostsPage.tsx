import { useState } from 'react';
import { POST_STATUSES, splitList, type Entry, type SectionDef } from '@profile/shared';
import { useSaveEntry } from '../api';
import SectionPage from '../components/SectionPage';

type StatusFilter = 'all' | (typeof POST_STATUSES)[number];

/** Post text ready to paste into LinkedIn: content followed by hashtags. */
function linkedInText(post: Entry): string {
  const tags = splitList(post.hashtags).map((t) => (t.startsWith('#') ? t : `#${t}`));
  return [post.content, tags.join(' ')].filter(Boolean).join('\n\n');
}

export default function PostsPage({ section }: { section: SectionDef }) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const save = useSaveEntry(section.key);

  async function copy(post: Entry) {
    await navigator.clipboard.writeText(linkedInText(post));
    setCopiedId(post.id);
    setTimeout(() => setCopiedId((id) => (id === post.id ? null : id)), 1500);
  }

  const toolbar = (
    <div className="flex w-full overflow-x-auto rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm md:w-auto">
      {(['all', ...POST_STATUSES] as const).map((s) => (
        <button
          key={s}
          onClick={() => setStatus(s)}
          className={`flex-1 whitespace-nowrap px-3 py-2 capitalize md:flex-none md:py-1.5 first:rounded-l-md last:rounded-r-md ${status === s ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <SectionPage
      section={section}
      toolbar={toolbar}
      filter={status === 'all' ? undefined : (p) => (p.status || 'draft') === status}
      actions={(post) => (
        <>
          <button onClick={() => copy(post)} className="rounded px-3 py-2 md:px-2 md:py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
            {copiedId === post.id ? 'Copied!' : 'Copy for LinkedIn'}
          </button>
          {post.status !== 'posted' && (
            <button
              onClick={() => save.mutate({ id: post.id, data: { ...post, status: 'posted', postedDate: post.postedDate || new Date().toISOString().slice(0, 10) } })}
              disabled={save.isPending}
              className="rounded px-3 py-2 md:px-2 md:py-1 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50"
            >
              Mark as posted
            </button>
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
