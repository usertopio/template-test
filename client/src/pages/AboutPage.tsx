import { useState } from 'react';
import type { SectionDef } from '@profile/shared';
import { useSaveSingle, useSingle } from '../api';
import EntryForm from '../components/EntryForm';

export default function AboutPage({ section }: { section: SectionDef }) {
  const { data, isLoading, error } = useSingle(section.key);
  const save = useSaveSingle(section.key);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="hidden text-2xl font-semibold md:block">{section.label}</h1>
      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
      {!isLoading && !error && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <EntryForm
            key={data?.id ?? 'new'}
            section={section}
            initial={data}
            onSubmit={async (values) => {
              await save.mutateAsync(values);
              setSavedAt(new Date().toLocaleTimeString());
            }}
          />
          {savedAt && <p className="mt-3 text-xs text-green-700 dark:text-green-400">Saved at {savedAt}</p>}
        </div>
      )}
    </div>
  );
}
