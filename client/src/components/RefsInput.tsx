import { useState } from 'react';
import { getSection, splitList, type FieldDef } from '@profile/shared';
import { useEntries } from '../api';

interface Props {
  id: string;
  field: FieldDef;
  /** Comma-separated ids of the linked entries. */
  value: string;
  onChange: (value: string) => void;
}

const SEARCH_THRESHOLD = 6;

/** Searchable checklist for linking entries of another section (e.g. certifications). */
export default function RefsInput({ id, field, value, onChange }: Props) {
  const target = getSection(field.refSection!)!;
  const { data = [], isLoading } = useEntries(target.key);
  const [query, setQuery] = useState('');

  const selected = new Set(splitList(value));
  const q = query.trim().toLowerCase();
  const describe = (e: (typeof data)[number]) => [e[target.titleField], ...(target.subtitleFields ?? []).map((k) => e[k])].filter(Boolean);
  const visible = data.filter((e) => !q || describe(e).join(' ').toLowerCase().includes(q));

  function toggle(entryId: string) {
    const next = new Set(selected);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    // Keep only ids that still exist, in list order.
    onChange(data.filter((e) => next.has(e.id)).map((e) => e.id).join(','));
  }

  const count = data.filter((e) => selected.has(e.id)).length;

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        {count > 0 && <span className="text-xs font-normal text-slate-400">{count} linked</span>}
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
            <p className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">No {target.label.toLowerCase()} yet. Add them on the {target.label} page first.</p>
          )}
          {!isLoading && data.length > 0 && visible.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">No matches.</p>}
          {visible.map((e) => {
            const [title, ...rest] = describe(e);
            return (
              <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2.5 text-sm hover:bg-slate-100 sm:py-1.5 dark:hover:bg-slate-800">
                <input type="checkbox" className="mt-0.5" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                <span>
                  {title || '(untitled)'}
                  {rest.length > 0 && <span className="text-slate-500 dark:text-slate-400"> · {rest.join(' · ')}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}
