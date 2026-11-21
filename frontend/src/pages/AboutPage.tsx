import { useState } from 'react';
import { FileOutput } from 'lucide-react';
import { PROFILE_IMAGES, type ProfileImage, type SectionDef } from '@profile/shared';
import { ApiError, useSaveSingle, useSingle, useUploadMedia } from '../api';
import EntryForm from '../components/EntryForm';
import ExportDialog from '../components/ExportDialog';
import ProfileHeader, { type PendingImages } from '../components/ProfileHeader';

export default function AboutPage({ section }: { section: SectionDef }) {
  const { data, isLoading, error } = useSingle(section.key);
  const save = useSaveSingle(section.key);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Photos picked before About was first saved.
  const [pending, setPending] = useState<PendingImages>({});
  const upload = useUploadMedia();
  const [uploadError, setUploadError] = useState('');
  const [exporting, setExporting] = useState(false);

  /** After saving: upload the photos waiting for the entry; failed ones stay waiting for the next save. */
  async function uploadPending(entryId: string) {
    const failed: PendingImages = {};
    const problems: string[] = [];
    for (const [role, file] of Object.entries(pending) as [ProfileImage, File][]) {
      const { title } = PROFILE_IMAGES[role];
      try {
        await upload.mutateAsync({ section: section.key, entryId, title, description: '', file, role });
      } catch (err) {
        failed[role] = file;
        problems.push(`${title}: ${err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : (err as Error).message}`);
      }
    }
    setPending(failed);
    setUploadError(problems.length ? `Couldn't upload ${problems.join('; ')}. Save again to retry.` : '');
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="hidden text-2xl font-semibold md:block">{section.label}</h1>
        {data && (
          <button
            onClick={() => setExporting(true)}
            title="Export to Word, Excel or PDF"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileOutput size={16} aria-hidden />
            Export
          </button>
        )}
      </header>
      {data && <ExportDialog open={exporting} onClose={() => setExporting(false)} title={data.name || section.label} parts={[{ section, entries: [data] }]} />}
      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
      {!isLoading && !error && <ProfileHeader section={section} about={data ?? null} pending={pending} onPendingChange={setPending} />}
      {!isLoading && !error && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <EntryForm
            // Not keyed by the id: the first auto-save creates the row, and the form must stay as it is being typed in.
            key="about"
            section={section}
            initial={data}
            autoSave={async (values) => {
              await save.mutateAsync(values);
            }}
            onSubmit={async (values) => {
              const saved = await save.mutateAsync(values);
              setSavedAt(new Date().toLocaleTimeString());
              if (Object.keys(pending).length) await uploadPending(saved.id);
            }}
          />
          {savedAt && <p className="mt-3 text-xs text-green-700 dark:text-green-400">Saved at {savedAt}</p>}
          {upload.isPending && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Uploading photos…</p>}
          {uploadError && (
            <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {uploadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
