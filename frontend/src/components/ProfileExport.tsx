import { useState } from 'react';
import { FileOutput } from 'lucide-react';
import { DOMAIN_LIST, LOCATION_LIST, ORGANIZATIONS, SECTIONS, isDraft } from '@profile/shared';
import { useEntriesBySection, useSingle } from '../api';
import ExportDialog from './ExportDialog';

/** Sections a profile (CV) export starts with: everything but the lists of organizations and posts. */
const CV_SECTIONS = SECTIONS.filter((s) => s.key !== ORGANIZATIONS && s.key !== DOMAIN_LIST && s.key !== LOCATION_LIST && s.key !== 'posts').map((s) => s.key);
const about = SECTIONS.find((s) => s.singleton)!;
const lists = SECTIONS.filter((s) => !s.singleton);

/** The sidebar's "Export profile": the whole profile, section by section, as one Word, Excel or PDF file. */
export default function ProfileExport() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 md:py-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <FileOutput size={16} aria-hidden />
        Export profile
      </button>
      {/* The entries load only once it's opened. */}
      {open && <ProfileExportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileExportDialog({ onClose }: { onClose: () => void }) {
  const { data: profile } = useSingle(about.key);
  const entries = useEntriesBySection(lists.map((s) => s.key));
  // Drafts are unfinished, so they stay out.
  const parts = [
    { section: about, entries: profile ? [profile] : [] },
    ...lists.map((section) => ({ section, entries: (entries.get(section.key) ?? []).filter((e) => !isDraft(e)) })),
  ];
  return <ExportDialog open onClose={onClose} title={profile?.name ? `${profile.name} - Profile` : 'Profile'} parts={parts} choose={{ initial: CV_SECTIONS }} />;
}
