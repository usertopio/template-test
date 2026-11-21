import { useState } from 'react';
import { exclusiveHolders, getSection, referencingSections, splitList, type Entry, type FieldDef, type SectionDef } from '@profile/shared';
import { useEntries, useEntriesBySection, useUnlinkEntry } from '../api';
import { useLocalize } from '../language';
import { useSaveWithMedia } from '../saveWithMedia';
// EntryForm renders this component too; the cycle is fine because both are only used at render time.
import EntryForm from './EntryForm';
import Modal from './Modal';

interface Props {
  id: string;
  /** The form's section and entry (none while it's new): that entry's own link isn't "elsewhere". */
  section: SectionDef;
  entryId?: string;
  field: FieldDef;
  /** Comma-separated ids of the linked entries. */
  value: string;
  /** What "+ New" fills in to start with, e.g. a new post's title from the entry it's made from. */
  newValues?: Record<string, string>;
  onChange: (value: string) => void;
}

const SEARCH_THRESHOLD = 6;

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** An entry of another section that links to one of the options. */
interface LinkedFrom {
  section: SectionDef;
  entry: Entry;
}

/**
 * Searchable checklist for linking entries of another section (e.g. certifications). A picked entry that is
 * also linked elsewhere says where, with Unlink buttons to remove those links. In an exclusive field
 * (certificates), one already linked to another entry of this section (another project) can't be picked
 * until it's unlinked there; links from other sections don't matter.
 */
export default function RefsInput({ id, section, entryId, field, value, newValues, onChange }: Props) {
  const target = getSection(field.refSection!)!;
  const localize = useLocalize();
  // Named in the language the profile is shown in.
  const { data: stored = [], isLoading } = useEntries(target.key);
  const data = stored.map((e) => localize(target, e));
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const saveWithMedia = useSaveWithMedia(target);
  const itemLabel = target.itemLabel ?? target.label.toLowerCase();

  // Every entry (other than this one) linking to each option, e.g. the projects a certificate is linked to.
  const referencing = referencingSections(target.key);
  const referrers = useEntriesBySection(referencing.map((r) => r.section.key));
  const linkedFrom = new Map<string, LinkedFrom[]>();
  for (const { section: s, fields } of referencing) {
    for (const entry of referrers.get(s.key) ?? []) {
      if (s.key === section.key && entry.id === entryId) continue;
      for (const optionId of new Set(fields.flatMap((f) => splitList(entry[f.key])))) linkedFrom.set(optionId, [...(linkedFrom.get(optionId) ?? []), { section: s, entry }]);
    }
  }
  const unlink = useUnlinkEntry();
  const [unlinking, setUnlinking] = useState('');
  const [unlinkError, setUnlinkError] = useState<{ key: string; message: string } | null>(null);
  const linkKey = (from: LinkedFrom, optionId: string) => `${from.section.key}/${from.entry.id}/${optionId}`;
  /** For an exclusive field: the other entry of this form's section already holding an option (shown even unpicked). */
  const heldBy = (optionId: string): LinkedFrom[] =>
    exclusiveHolders(section, target.key, optionId, referrers.get(section.key) ?? [], entryId).map((entry) => ({ section, entry }));

  const selected = new Set(splitList(value));
  const q = query.trim().toLowerCase();
  const describe = (e: (typeof data)[number]) => [e[target.titleField], ...(target.subtitleFields ?? []).map((k) => e[k])].filter(Boolean);
  const visible = data.filter((e) => !q || describe(e).join(' ').toLowerCase().includes(q));

  function toggle(entryId: string) {
    const next = new Set(selected);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    // Listed ones in list order, then any not in the list yet (e.g. one just made with "+ New", before the
    // list reloads). Ids of deleted entries are dropped by the server when saving.
    const listed = data.filter((e) => next.has(e.id)).map((e) => e.id);
    onChange([...listed, ...[...next].filter((id) => !listed.includes(id))].join(','));
  }

  const count = data.filter((e) => selected.has(e.id)).length;

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        <span className="flex items-baseline gap-3">
          {count > 0 && <span className="text-xs font-normal text-slate-400">{count} linked</span>}
          {field.createInline && (
            <button type="button" onClick={() => setCreating(true)} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
              + New {itemLabel}
            </button>
          )}
        </span>
      </legend>
      <div className="rounded-md border border-slate-300 dark:border-slate-700">
        {data.length > SEARCH_THRESHOLD && (
          <input
            id={id}
            type="search"
            placeholder={`Search ${target.label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-b border-slate-300 bg-transparent px-3 py-2 text-base focus:outline-none sm:text-sm dark:border-slate-700"
          />
        )}
        <div className="max-h-48 overflow-y-auto p-1">
          {isLoading && <p className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
          {!isLoading && data.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
              No {target.label.toLowerCase()} yet. {field.createInline ? `Use “+ New ${itemLabel}” to add one.` : `Add them on the ${target.label} page first.`}
            </p>
          )}
          {!isLoading && data.length > 0 && visible.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">No matches.</p>}
          {visible.map((e) => {
            const [title, ...rest] = describe(e);
            const held = heldBy(e.id);
            // Linked elsewhere and not picked here: unlink it there first.
            const locked = held.length > 0 && !selected.has(e.id);
            const elsewhere = locked ? held : selected.has(e.id) ? (linkedFrom.get(e.id) ?? []) : [];
            return (
              <div key={e.id}>
                <label
                  className={`flex items-start gap-2 rounded px-2 py-2.5 text-sm sm:py-1.5 ${locked ? 'cursor-not-allowed text-slate-500 dark:text-slate-400' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <input type="checkbox" className="mt-0.5" checked={selected.has(e.id)} disabled={locked} onChange={() => toggle(e.id)} />
                  <span>
                    {title || '(untitled)'}
                    {rest.length > 0 && <span className="text-slate-500 dark:text-slate-400"> · {rest.join(' · ')}</span>}
                  </span>
                </label>
                {elsewhere.length > 0 && (
                  <div role="group" aria-label={`Where “${title || '(untitled)'}” is also linked`} className="mb-1 ml-8 space-y-1 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="font-medium">{locked ? `Already linked to another ${section.itemLabel ?? 'entry'} (unlink it there to link it here):` : 'Also linked to:'}</p>
                    {elsewhere.map((from) => {
                      const key = linkKey(from, e.id);
                      const name = localize(from.section, from.entry)[from.section.titleField] || '(untitled)';
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">
                              <span className="opacity-70">{capitalize(from.section.itemLabel ?? from.section.label)}:</span> {name}
                            </span>
                            <button
                              type="button"
                              disabled={!!unlinking}
                              aria-label={`Unlink ${title || '(untitled)'} from ${name}`}
                              onClick={() => {
                                setUnlinkError(null);
                                setUnlinking(key);
                                unlink.mutate(
                                  { section: from.section.key, id: from.entry.id, target: target.key, targetId: e.id },
                                  {
                                    onError: (err) => setUnlinkError({ key, message: `Couldn't unlink: ${err.message}` }),
                                    onSettled: () => setUnlinking(''),
                                  },
                                );
                              }}
                              className="shrink-0 rounded px-2 py-1 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/15"
                            >
                              {unlinking === key ? 'Unlinking…' : 'Unlink'}
                            </button>
                          </div>
                          {unlinkError?.key === key && (
                            <p role="alert" className="text-red-700 dark:text-red-300">
                              {unlinkError.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {mediaError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{mediaError}</p>}

      {field.createInline && (
        <Modal open={creating} title={`New ${itemLabel}`} back onRequestClose={() => setCreating(false)}>
          {creating && (
            <EntryForm
              variant="modal"
              section={target}
              initial={newValues}
              backupKey={target.key}
              submitLabel={`Save and link`}
              onCancel={() => setCreating(false)}
              onSubmit={async (values, pendingMedia) => {
                // Link it straight away (the list may not have reloaded yet), then let its files upload.
                const problem = await saveWithMedia.run(undefined, values, pendingMedia, {
                  onSaved: (entry) => {
                    onChange([...splitList(value), entry.id].join(','));
                    setCreating(false);
                  },
                });
                setMediaError(problem);
              }}
            />
          )}
        </Modal>
      )}
    </fieldset>
  );
}
