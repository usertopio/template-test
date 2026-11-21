import { useState, type FormEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { LANGUAGE_NAMES, LANGUAGES, SECTIONS, type Language } from '@profile/shared';
import { setLanguage } from '../language';
import { updateSettings, useSettings, type Settings } from '../settings';

/**
 * How the app opens on this device: the page it starts on and the profile's language. Choices take effect only on
 * Apply, so trying one out changes nothing until you mean it.
 */
export default function SettingsPage() {
  const saved = useSettings();
  const [draft, setDraft] = useState<Settings>(saved);
  const [applied, setApplied] = useState(false);
  const changed = draft.startPage !== saved.startPage || draft.startLanguage !== saved.startLanguage;
  const change = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setApplied(false);
  };
  const apply = (e: FormEvent) => {
    e.preventDefault();
    updateSettings(draft);
    // Applied now, so it shows straight away rather than on the next visit.
    if (draft.startLanguage) setLanguage(draft.startLanguage);
    setApplied(true);
  };
  const choices: { value: Language | ''; label: string }[] = [{ value: '', label: 'Last used' }, ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))];

  return (
    <form onSubmit={apply} className="space-y-6">
      <header>
        <h1 className="hidden text-2xl font-semibold md:block">Settings</h1>
        <p className="text-sm text-slate-500 md:mt-1 dark:text-slate-400">Kept in this browser, so each device can open its own way.</p>
      </header>
      <Setting id="start-page" title="Start page" note="The page the app opens on.">
        <select
          aria-labelledby="start-page"
          value={draft.startPage}
          onChange={(e) => change({ startPage: e.target.value })}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-64 dark:border-slate-700 dark:bg-slate-900"
        >
          {SECTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </Setting>
      <Setting id="start-language" title="Start language" note="The language the profile opens in. Last used keeps the one picked last in the menu.">
        <div role="group" aria-labelledby="start-language" className="inline-flex flex-wrap rounded-md border border-slate-300 p-0.5 text-sm dark:border-slate-700">
          {choices.map(({ value, label }) => (
            <button
              key={value || 'last'}
              type="button"
              lang={value || undefined}
              aria-pressed={draft.startLanguage === value}
              onClick={() => change({ startLanguage: value })}
              className={`rounded px-3 py-1.5 ${draft.startLanguage === value ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Setting>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!changed} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600">
          Apply
        </button>
        {changed ? (
          <button type="button" onClick={() => change(saved)} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            Discard changes
          </button>
        ) : (
          applied && (
            <span role="status" className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
              <Check size={16} aria-hidden />
              Applied
            </span>
          )
        )}
      </div>
    </form>
  );
}

function Setting({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 id={id} className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>
      </div>
      {children}
    </section>
  );
}
