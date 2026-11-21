import { useState } from 'react';
import { ArrowLeft, Eye, LoaderCircle } from 'lucide-react';
import { LANGUAGE_NAMES, mediaOf, type MediaItem } from '@profile/shared';
import { useMedia } from '../api';
import { FORMATS, type ExportFormat, type ExportLanguage, type ExportPart } from '../export/model';
import { useExport, type ExportStep, type PreparedExport } from '../export/run';
import ExportPreview from './ExportPreview';
import Modal from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The document's title and file name, e.g. "Projects" or the entry's name. */
  title: string;
  /** What to export. With `choose`, only the parts whose section is ticked. */
  parts: ExportPart[];
  /** Offer a tick box per part's section (the whole-profile export). */
  choose?: { initial: string[] };
}

const LANGUAGES: { value: ExportLanguage; label: string }[] = [
  { value: 'en', label: LANGUAGE_NAMES.en },
  { value: 'th', label: LANGUAGE_NAMES.th },
  { value: 'both', label: `Both` },
];

function stepText(step: ExportStep, format: ExportFormat) {
  if (step.step === 'writing') return `Writing the ${FORMATS[format].label} file…`;
  if (!step.total) return 'Getting ready…';
  return step.step === 'images' ? `Preparing images ${step.done + 1}/${step.total}…` : `Adding files ${step.done + 1}/${step.total}…`;
}

const countFiles = (parts: ExportPart[], media: MediaItem[]) =>
  parts.reduce((n, p) => n + p.entries.reduce((m, e) => m + mediaOf(media, e.id).filter((f) => !p.mediaIds || p.mediaIds.includes(f.id)).length, 0), 0);

/** Export entries as Word, Excel or PDF, in English, Thai or both, optionally zipped with their files; preview it first if you like. */
export default function ExportDialog({ open, onClose, title, parts, choose }: Props) {
  return (
    <Modal open={open} title="Export" onRequestClose={onClose}>
      {/* Fresh choices each time it opens. */}
      {open && <ExportForm title={title} parts={parts} choose={choose} onDone={onClose} />}
    </Modal>
  );
}

function ExportForm({ title, parts, choose, onDone }: Omit<Props, 'open' | 'onClose'> & { onDone: () => void }) {
  // PDF unless you pick another: it opens anywhere and looks the same everywhere, Thai included.
  const [format, setFormat] = useState<ExportFormat>('pdf');
  // Both languages unless you pick one: a profile is usually wanted in English and Thai together.
  const [lang, setLang] = useState<ExportLanguage>('both');
  const [includeFiles, setIncludeFiles] = useState(true);
  const [ticked, setTicked] = useState<string[]>(choose?.initial ?? []);
  const { data: media = [] } = useMedia();
  const exporter = useExport();
  // The prepared export being previewed; Export then saves exactly that.
  const [previewing, setPreviewing] = useState<PreparedExport | null>(null);
  // Which button is working, so its progress shows on it.
  const [working, setWorking] = useState<'preview' | 'export' | null>(null);

  const chosen = choose ? parts.filter((p) => ticked.includes(p.section.key)) : parts;
  const entries = chosen.reduce((n, p) => n + p.entries.length, 0);
  const files = countFiles(chosen, media);
  const busy = exporter.step !== null;
  const options = { format, lang, includeFiles: includeFiles && files > 0 };
  const languageName = LANGUAGES.find((l) => l.value === lang)!.label;

  const option = (on: boolean) =>
    `rounded-md border px-3 py-2 text-sm ${on ? 'border-blue-600 bg-blue-50 font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-200' : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        setWorking('export');
        const done = await exporter.run(title, chosen, options, previewing ?? undefined);
        setWorking(null);
        if (done) onDone();
      }}
    >
      {previewing && (
        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-100 px-5 py-4 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setPreviewing(null)} disabled={busy} className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
              <ArrowLeft size={16} aria-hidden />
              Back to options
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {FORMATS[format].label} · {languageName}
            </p>
          </div>
          <ExportPreview prepared={previewing} />
          {format !== 'pdf' && <p className="text-xs text-slate-500 dark:text-slate-400">How the content is laid out. {FORMATS[format].label} may set fonts and page breaks a little differently.</p>}
          {exporter.error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {exporter.error}
            </p>
          )}
        </div>
      )}
      <div hidden={!!previewing} className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Format</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMATS) as ExportFormat[]).map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={option(format === f)}>
                {FORMATS[f].label} <span className="text-xs opacity-70">.{FORMATS[f].ext}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Language</legend>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button key={l.value} type="button" aria-pressed={lang === l.value} onClick={() => setLang(l.value)} className={option(lang === l.value)}>
                {l.label}
              </button>
            ))}
          </div>
          {lang === 'both' && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thai text follows the English wherever it differs.</p>}
        </fieldset>

        {choose && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Sections</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {parts.map((p) => (
                <label key={p.section.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ticked.includes(p.section.key)}
                    onChange={() => setTicked((t) => (t.includes(p.section.key) ? t.filter((k) => k !== p.section.key) : [...t, p.section.key]))}
                  />
                  {p.section.label}
                  <span className="text-xs text-slate-400">{p.entries.length}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {files > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
            <span>
              Include the original files ({files})
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Images are shown in the document either way. With this ticked, you get a .zip of the document and a media folder.
              </span>
            </span>
          </label>
        )}

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {entries} {entries === 1 ? 'entry' : 'entries'}
          {files > 0 && ` · ${files} ${files === 1 ? 'file' : 'files'}`}
        </p>
        {exporter.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {exporter.error}
          </p>
        )}
      </div>
      <div className="flex gap-2 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] *:flex-1 sm:*:flex-none dark:border-slate-800">
        <button type="submit" disabled={busy || !entries} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy && working === 'export' && <LoaderCircle size={16} aria-hidden className="animate-spin" />}
          {exporter.step && working === 'export' ? stepText(exporter.step, format) : `Export ${FORMATS[format].label}`}
        </button>
        {!previewing && (
          <button
            type="button"
            disabled={busy || !entries}
            onClick={async () => {
              setWorking('preview');
              setPreviewing(await exporter.preview(title, chosen, options));
              setWorking(null);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {busy && working === 'preview' ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Eye size={16} aria-hidden />}
            {exporter.step && working === 'preview' ? stepText(exporter.step, format) : 'Preview'}
          </button>
        )}
        {/* While it works, Cancel stops it and the choices stay, to change and try again; otherwise it closes. */}
        <button
          type="button"
          onClick={busy ? exporter.cancel : onDone}
          aria-label={busy ? `Cancel the ${working === 'preview' ? 'preview' : 'export'}` : undefined}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
