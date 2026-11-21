import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SECTIONS, getSection, hasImageSlots, mediaKind, mediaOf, splitList, type Entry, type FieldDef, type MediaItem, type SectionDef } from '@profile/shared';
import { useEntriesBySection, useMedia } from '../api';
import { useLocalize } from '../language';
import { inputClass } from './ComboInputs';
import { MediaThumb } from './Media';
import Modal from './Modal';

interface Props {
  id: string;
  /** The form's section (posts) and its values: the entries it's linked to offer their files first. */
  section: SectionDef;
  values: Record<string, string>;
  field: FieldDef;
  /** Comma-separated media ids, in the order picked. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Sections whose entries have a list of files to pick from: not About's photos or an organization's logo, nor other
 * posts (a post's own uploads are for that post).
 */
const FILE_SECTIONS = SECTIONS.filter((s) => s.media && !hasImageSlots(s) && !s.fields.some((f) => f.type === 'media'));

/** An entry with its files, for the chooser. */
interface Group {
  section: SectionDef;
  entry: Entry;
  files: MediaItem[];
}

/**
 * Files already stored with other entries, picked for a post (its photos, a certificate, a PDF): the picked ones in
 * order, with arrows to reorder and × to drop them, and "Choose media" for a list of every entry's files. Files of
 * the entries the post is linked to come first. Text files aren't offered: a post can't carry them.
 */
export default function MediaPicker({ id, section, values, field, value, onChange }: Props) {
  const localize = useLocalize();
  const { data: media = [] } = useMedia();
  const entries = useEntriesBySection(FILE_SECTIONS.map((s) => s.key));
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');

  const usable = media.filter((m) => mediaKind(m.mimeType) !== 'text');
  const picked = splitList(value).flatMap((pid) => usable.filter((m) => m.id === pid));
  const pickedIds = picked.map((m) => m.id);
  const set = (ids: string[]) => onChange(ids.join(','));
  const toggle = (mid: string) => set(pickedIds.includes(mid) ? pickedIds.filter((x) => x !== mid) : [...pickedIds, mid]);
  const move = (i: number, by: -1 | 1) => {
    const ids = [...pickedIds];
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    set(ids);
  };

  const nameOf = (s: SectionDef, e: Entry) => localize(s, e)[s.titleField] || '(untitled)';
  const ownerOf = (m: MediaItem) => {
    const s = getSection(m.section);
    const e = s && entries.get(s.key)?.find((x) => x.id === m.entryId);
    return s && e ? `${s.itemLabel ? s.itemLabel[0].toUpperCase() + s.itemLabel.slice(1) : s.label}: ${nameOf(s, e)}` : '';
  };

  // The entries the post links to (its "Linked to" fields), then every other entry with files.
  const linkedIds = new Set(section.fields.filter((f) => f.type === 'refs').flatMap((f) => splitList(values[f.key])));
  const groups: Group[] = FILE_SECTIONS.flatMap((s) =>
    (entries.get(s.key) ?? []).map((entry) => ({ section: s, entry, files: mediaOf(usable, entry.id) })).filter((g) => g.files.length),
  );
  const q = query.trim().toLowerCase();
  const matches = (g: Group) => !q || [nameOf(g.section, g.entry), g.section.label, ...g.files.map((f) => f.title)].join(' ').toLowerCase().includes(q);
  const linked = groups.filter((g) => linkedIds.has(g.entry.id) && matches(g));
  const others = groups.filter((g) => !linkedIds.has(g.entry.id) && matches(g));

  const groupList = (title: string, list: Group[], empty: string) => (
    <section aria-label={title} className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h3>
      {list.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>}
      {list.map((g) => (
        <div key={g.entry.id} role="group" aria-label={`${g.section.label}: ${nameOf(g.section, g.entry)}`} className="space-y-1.5">
          <p className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">{g.section.label}:</span> {nameOf(g.section, g.entry)}
          </p>
          <div className="flex flex-wrap gap-2">
            {g.files.map((m) => {
              const on = pickedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={m.title}
                  title={m.title}
                  onClick={() => toggle(m.id)}
                  className={`relative w-20 space-y-1 rounded-md p-1 text-left ${on ? 'bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <MediaThumb source={{ item: m }} title={m.title} className="h-18 w-18" />
                  <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">{m.title}</span>
                  {on && (
                    <span aria-hidden className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                      {pickedIds.indexOf(m.id) + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        <span className="flex items-baseline gap-3">
          {picked.length > 0 && <span className="text-xs font-normal text-slate-400">{picked.length} picked</span>}
          <button id={id} type="button" onClick={() => setChoosing(true)} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
            Choose media
          </button>
        </span>
      </legend>
      {picked.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No media yet. Pick photos, videos or PDFs already saved with your activities, projects and other entries.
        </p>
      ) : (
        <ol className="flex flex-wrap gap-3">
          {picked.map((m, i) => (
            <li key={m.id} className="relative w-24 space-y-1">
              <MediaThumb source={{ item: m }} title={m.title} className="h-24 w-24" />
              <span className="block text-xs wrap-anywhere text-slate-700 dark:text-slate-300">{m.title}</span>
              <span className="block text-[10px] wrap-anywhere text-slate-500 dark:text-slate-400">{ownerOf(m)}</span>
              <button
                type="button"
                aria-label={`Remove “${m.title}”`}
                title="Remove"
                onClick={() => set(pickedIds.filter((x) => x !== m.id))}
                className="absolute top-1 right-1 rounded-full bg-slate-950/60 p-1 text-white hover:bg-red-600"
              >
                <X size={12} strokeWidth={2.5} aria-hidden />
              </button>
              {picked.length > 1 && (
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move “${m.title}” earlier`} disabled={i === 0} onClick={() => move(i, -1)} className="flex flex-1 justify-center rounded py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800">
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  <button type="button" aria-label={`Move “${m.title}” later`} disabled={i === picked.length - 1} onClick={() => move(i, 1)} className="flex flex-1 justify-center rounded py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800">
                    <ChevronRight size={14} aria-hidden />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <Modal open={choosing} title="Choose media" back onRequestClose={() => setChoosing(false)}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
            <input type="search" aria-label="Search files and entries" placeholder="Search files and entries…" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} />
            {groupList('From linked entries', linked, linkedIds.size ? 'Nothing matches.' : 'Link this post to an activity, project or another entry (under “Linked to”) to see its files here first.')}
            {groupList('Other entries', others, q ? 'Nothing matches.' : 'No other files yet.')}
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
            <span className="mr-auto text-sm text-slate-500 dark:text-slate-400">{picked.length} picked, in the order ticked</span>
            <button type="button" onClick={() => setChoosing(false)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Check size={16} aria-hidden />
              Done
            </button>
          </div>
        </div>
      </Modal>
    </fieldset>
  );
}
