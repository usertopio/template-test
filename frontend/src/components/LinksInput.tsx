import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { joinLinks, splitLinks, type LinkItem } from '@profile/shared';
import { inputClass } from './ComboInputs';

const BLANK: LinkItem = { title: '', url: '' };

/**
 * An entry's links (a 'links' field), a row each: a title and its address, and with `withEmail` the email signed up
 * with there (see FieldDef.accountEmail). `value` is the cell (see splitLinks).
 * The rows are kept here, not re-read from `value` on every change, so a row emptied while it's retyped (or one just
 * added) stays put instead of vanishing from under the cursor; only a change from outside (a restored draft) resets them.
 */
export default function LinksInput({ id, value, onChange, withEmail = false }: { id: string; value: string; onChange: (v: string) => void; withEmail?: boolean }) {
  const [rows, setRows] = useState<LinkItem[]>(() => (value.trim() ? splitLinks(value) : [BLANK]));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (joinLinks(rows) !== value) setRows(value.trim() ? splitLinks(value) : [BLANK]);
  }
  function update(next: LinkItem[]) {
    const joined = joinLinks(next);
    setRows(next);
    setSeen(joined);
    onChange(joined);
  }
  const set = (i: number, patch: Partial<LinkItem>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0 dark:border-slate-800">
          <input
            id={i === 0 ? id : undefined}
            aria-label={`Link ${i + 1} title`}
            className={`${inputClass} sm:w-2/5`}
            placeholder="Title, e.g. Recording"
            value={row.title}
            onChange={(e) => set(i, { title: e.target.value })}
          />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {/* The address and its sign-up email: stacked on a phone, side by side on wider screens. */}
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
              <input
                type="url"
                aria-label={`Link ${i + 1} URL`}
                className={inputClass}
                placeholder="https://…"
                value={row.url}
                onChange={(e) => set(i, { url: e.target.value })}
              />
              {withEmail && (
                <input
                  type="email"
                  aria-label={`Link ${i + 1} sign-up email`}
                  className={`${inputClass} sm:w-2/5`}
                  placeholder="Signed up with (email)"
                  value={row.email ?? ''}
                  onChange={(e) => set(i, { email: e.target.value })}
                />
              )}
            </span>
            <button
              type="button"
              onClick={() => update(rows.length > 1 ? rows.filter((_, j) => j !== i) : [BLANK])}
              aria-label={`Remove link ${i + 1}`}
              title="Remove"
              className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              <X size={16} aria-hidden />
            </button>
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, BLANK])}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
      >
        <Plus size={14} aria-hidden />
        Add link
      </button>
    </div>
  );
}
