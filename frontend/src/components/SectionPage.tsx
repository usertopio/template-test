import { Suspense, lazy, useState, type ReactNode } from 'react';
import { CalendarDays, Download, FileOutput, List, ListChecks, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { LOCATION_LIST, entryFolderName, linkedFromFields, localToday, mediaOf, type Entry, type MediaItem, type SectionDef } from '@profile/shared';
import { useDeleteEntry, useEntries, type EntryInput } from '../api';
import { useLanguage, useLocalize } from '../language';
import { useMediaDownload, zipPaths } from '../download';
import { entryText } from '../entryText';
import { applyListing } from '../listing';
import EntryDialog from './EntryDialog';
import ListControls, { FilterPanel, NarrowedNotice, SearchBox, activeFilters, segmentClass, useListView, useListingState, type ListView } from './ListControls';
import { ToolsButton, ToolsPanel } from './ToolsPanel';
import { CardMedia, EntrySummary, useCardData } from './EntryCard';
import { PreviewProvider } from './EntryPreview';
import CopyButton from './CopyButton';
import ConfirmDialog from './ConfirmDialog';
import ExportDialog from './ExportDialog';

// The calendar library is large, so it loads only when a calendar is shown.
const CalendarView = lazy(() => import('./CalendarView'));

interface Props {
  section: SectionDef;
  /** Extra per-card actions. */
  actions?: (entry: Entry) => ReactNode;
}

/** Generic list + add/edit/delete page for a list section. */
export default function SectionPage({ section, actions }: Props) {
  const { data, isLoading, error } = useEntries(section.key);
  const remove = useDeleteEntry(section.key);
  // null = closed, 'new' = adding, otherwise the entry being edited
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  // What a new entry starts with: the day clicked on the calendar.
  const [newValues, setNewValues] = useState<EntryInput | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  // null: not selecting; otherwise the ids ticked to delete or download together.
  const [chosen, setChosen] = useState<string[] | null>(null);
  // Media ids ticked for download: ticking an entry ticks all its files, which can then be unticked one by one.
  const [chosenFiles, setChosenFiles] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState('');
  // What the Export dialog exports: the ticked entries (and files), or one card's entry.
  const [exporting, setExporting] = useState<{ title: string; entries: Entry[]; mediaIds?: string[] } | null>(null);
  const { media, related, backlinksFor } = useCardData(section);
  const files = useMediaDownload();
  const lang = useLanguage();
  const localize = useLocalize();

  const [listing, setListing] = useListingState(section);
  const { view, month, setView, setMonth } = useListView(section, localToday().slice(0, 7));
  // Ticking entries needs their cards, so selecting shows the list; the calendar comes back after.
  const calendar = view === 'calendar' && !chosen;
  // The tools panel, where it slides in (below xl); on wide screens it's always open.
  const [toolsOpen, setToolsOpen] = useState(false);
  const all = data ?? [];
  // Posts linking this section's entries, for the "In a post / Not in a post yet" filter (loaded for the cards).
  const linkers = new Map(linkedFromFields(section.key).map(({ section: from }) => [from.key, related.get(from.key) ?? []]));
  const entries = applyListing(section, all, listing, lang, linkers, media);
  const filtersOn = activeFilters(section, all, linkers, listing, media);
  // Ticked entries among those shown: a filter hides an entry from the selection too.
  const ticked = chosen ? entries.filter((e) => chosen.includes(e.id)) : [];
  const tickedFiles = section.media ? zipPaths(section, entries, media.filter((m) => chosenFiles.includes(m.id)), { folders: true }) : [];
  const allTicked = entries.length > 0 && ticked.length === entries.length;
  // Download and Export act on the selection when there is one, otherwise on every entry shown.
  const selecting = ticked.length > 0 || tickedFiles.length > 0;
  const targetFiles = selecting ? tickedFiles : section.media ? zipPaths(section, entries, media, { folders: true }) : [];
  // Their counts are entries: the ticked ones, or all shown. Files ticked on their own count the entries they belong to.
  const downloadCount = ticked.length || (selecting ? new Set(tickedFiles.map((f) => f.item.entryId)).size : entries.length);
  const exportEntries = ticked.length ? ticked : entries;
  const filesOf = (ids: string[]) => ids.flatMap((id) => mediaOf(media, id).map((m) => m.id));
  function tick(id: string) {
    const on = !chosen?.includes(id);
    setChosen((c) => (on ? [...(c ?? []), id] : (c ?? []).filter((x) => x !== id)));
    const own = filesOf([id]);
    setChosenFiles((f) => (on ? [...new Set([...f, ...own])] : f.filter((x) => !own.includes(x))));
  }
  function tickAll(on: boolean) {
    setChosen(on ? entries.map((e) => e.id) : []);
    setChosenFiles(on ? filesOf(entries.map((e) => e.id)) : []);
  }
  const fileSelection = { ids: chosenFiles, toggle: (id: string) => setChosenFiles((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])) };
  const stopSelecting = () => {
    setChosen(null);
    setChosenFiles([]);
  };
  const plural = (n: number) => (n === 1 ? (section.itemLabel ?? 'entry') : section.itemLabel ? section.label.toLowerCase() : 'entries');

  /** Delete the ticked entries one after another; any that fail stay ticked, with the reason. */
  async function deleteTicked() {
    setBulkDeleting(true);
    setBulkError('');
    const failed: string[] = [];
    let reason = '';
    for (const entry of ticked) {
      try {
        await remove.mutateAsync(entry.id);
      } catch (err) {
        failed.push(entry.id);
        reason = (err as Error).message;
      }
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    if (failed.length) {
      setChosen(failed);
      setBulkError(`Couldn't delete ${failed.length} ${plural(failed.length)}: ${reason}`);
    } else stopSelecting();
  }

  const open = (target: Entry | 'new', start?: EntryInput) => {
    setNewValues(start);
    setEditing(target);
  };

  return (
    <PreviewProvider page={section.key} onEdit={open}>
      <div className="space-y-6">
        {/* Sticks to the top as the list scrolls, so the tools button and + Add stay in reach (below xl the tools
            panel is closed until the button opens it). On mobile the top bar shows the name and tools instead. */}
        <header className="sticky top-0 z-20 -mx-8 hidden items-center justify-between gap-3 bg-slate-50/90 px-8 py-3 backdrop-blur md:flex dark:bg-slate-950/90">
          <h1 className="flex shrink-0 items-center gap-2 text-2xl font-semibold">
            {section.label}
            {data && <EntryTotal count={all.length} />}
          </h1>
          {all.length > 0 && <SearchBox section={section} state={listing} onChange={setListing} className="min-w-0 max-w-md flex-1" />}
          <div className="flex shrink-0 items-center gap-2">
            <ToolsButton open={toolsOpen} onOpen={() => setToolsOpen(true)} active={filtersOn} />
            <button onClick={() => open('new')} className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              + Add
            </button>
          </div>
        </header>

        {/* On a phone the header is the app's top bar, so the search sits at the top of the list instead. */}
        {all.length > 0 && <SearchBox section={section} state={listing} onChange={setListing} className="w-full md:hidden" />}
        {section.calendar && !chosen && <ViewSwitch view={view} onChange={setView} />}

        <ToolsPanel open={toolsOpen} onClose={() => setToolsOpen(false)}>
          {/* Search first, the few actions next so they're always in reach, then the filters, which can run long. */}
          {all.length > 0 ? (
            <ListControls section={section} state={listing} onChange={setListing} sortable={!calendar} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing to search or filter yet.</p>
          )}
          {entries.length > 0 && (
            <div role="group" aria-label="Actions" className="space-y-2">
              {!chosen && (
                <button
                  onClick={() => {
                    setBulkError('');
                    setChosen([]);
                    setChosenFiles([]);
                    setToolsOpen(false);
                  }}
                  className={panelButton}
                >
                  <ListChecks size={16} aria-hidden />
                  Select
                </button>
              )}
              {section.media && (
                // Stays open while it runs, so its progress shows.
                <button
                  onClick={() => files.download(targetFiles, `${section.label}.zip`, PAGE)}
                  disabled={!targetFiles.length || !!files.progress}
                  aria-label={files.progress?.key === PAGE ? `Preparing ${files.progress.done} of ${files.progress.total}` : `Download the files of ${selecting ? 'the' : 'all'} ${downloadCount} ${selecting ? 'selected ' : ''}${plural(downloadCount)}`}
                  title={!targetFiles.length ? 'No files to download' : `Download the files of ${selecting ? 'the selected' : 'all'} ${plural(2)} as a .zip`}
                  className={`${panelButton} ${files.progress?.key === PAGE ? 'disabled:opacity-100' : ''}`}
                >
                  {files.progress?.key === PAGE ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Download size={16} aria-hidden />}
                  <span aria-hidden className="flex-1 text-left">
                    Download files
                  </span>
                  <span aria-hidden className="tabular-nums text-slate-500 dark:text-slate-400">
                    {files.progress?.key === PAGE ? `${files.progress.done}/${files.progress.total}` : downloadCount}
                  </span>
                </button>
              )}
              {files.progress?.key === PAGE && (
                <button onClick={files.cancel} className={panelButton}>
                  <X size={16} aria-hidden />
                  <span className="flex-1 text-left">Cancel download</span>
                </button>
              )}
              <button
                onClick={() => {
                  setExporting({ title: section.label, entries: exportEntries, mediaIds: ticked.length ? chosenFiles : undefined });
                  setToolsOpen(false);
                }}
                aria-label={`Export ${ticked.length ? 'the' : 'all'} ${exportEntries.length} ${ticked.length ? 'selected ' : ''}${plural(exportEntries.length)}`}
                title={`Export ${ticked.length ? 'the selected' : 'all'} ${plural(2)} to Word, Excel or PDF`}
                className={panelButton}
              >
                <FileOutput size={16} aria-hidden />
                <span aria-hidden className="flex-1 text-left">
                  Export
                </span>
                <span aria-hidden className="tabular-nums text-slate-500 dark:text-slate-400">
                  {exportEntries.length}
                </span>
              </button>
            </div>
          )}
          {all.length > 0 && (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <FilterPanel section={section} entries={all} linkers={linkers} media={media} state={listing} onChange={setListing} />
            </div>
          )}
        </ToolsPanel>

        {/* Mobile floating add button */}
        <button
          onClick={() => open('new')}
          aria-label={`Add ${section.itemLabel ?? section.label.toLowerCase()}`}
          className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-900/30 hover:bg-blue-700 active:scale-95 md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <ConfirmDialog
          open={confirmDelete !== null}
          title={`Delete this ${section.itemLabel ?? 'entry'}?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={remove.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const { id } = confirmDelete!;
            setDeleteError(null);
            remove.mutate(id, {
              onError: (err) => setDeleteError({ id, message: `Couldn't delete: ${err.message}` }),
              onSettled: () => setConfirmDelete(null),
            });
          }}
        >
          <strong className="font-medium text-slate-900 dark:text-slate-100">{(confirmDelete && localize(section, confirmDelete)[section.titleField]) || '(untitled)'}</strong>
          {section.media ? ' and its files will be removed.' : ' will be removed.'} This can't be undone.
        </ConfirmDialog>

        {chosen && (
          <div role="toolbar" aria-label={`Selected ${section.label.toLowerCase()}`} className="sticky top-14 z-10 flex flex-wrap items-center gap-1 rounded-md bg-blue-50 px-2 py-1.5 text-sm text-blue-900 md:top-16 dark:bg-blue-950 dark:text-blue-100">
            <span className="mr-auto px-1">
              {ticked.length || tickedFiles.length
                ? [ticked.length && `${ticked.length} ${plural(ticked.length)}`, tickedFiles.length && `${tickedFiles.length} ${tickedFiles.length === 1 ? 'file' : 'files'}`].filter(Boolean).join(' · ') + ' selected'
                : section.media
                  ? `Tick ${plural(2)} to download, export or delete, or single files to download`
                  : `Tick ${plural(2)} to export or delete`}
            </span>
            <button type="button" onClick={() => tickAll(!allTicked)} className={toolButton}>
              {allTicked ? 'Deselect all' : 'Select all'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={!ticked.length || bulkDeleting}
              aria-label={`Delete ${ticked.length} selected`}
              title="Delete selected"
              className={`${toolButton} text-red-700 dark:text-red-400`}
            >
              <Trash2 size={16} aria-hidden />
              {ticked.length || ''}
            </button>
            <button type="button" onClick={stopSelecting} disabled={bulkDeleting || files.progress?.key === PAGE} className={toolButton}>
              Cancel
            </button>
          </div>
        )}
        {bulkError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{bulkError}</p>}
        {files.error?.key === PAGE && <p className="text-sm text-red-600 dark:text-red-400">{files.error.message}</p>}

        <ExportDialog
          open={exporting !== null}
          onClose={() => setExporting(null)}
          title={exporting?.title ?? ''}
          parts={exporting ? [{ section, entries: exporting.entries, mediaIds: exporting.mediaIds }] : []}
        />

        <ConfirmDialog
          open={confirmBulkDelete}
          title={`Delete ${ticked.length} ${plural(ticked.length)}?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={bulkDeleting}
          onCancel={() => setConfirmBulkDelete(false)}
          onConfirm={() => void deleteTicked()}
        >
          {ticked.length === 1 ? 'It' : 'They'}
          {section.media ? ' and their files will be removed.' : ' will be removed.'} This can't be undone.
        </ConfirmDialog>

        <EntryDialog section={section} editing={editing} newValues={newValues} onClose={() => setEditing(null)} />
        {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
        <NarrowedNotice section={section} entries={all} linkers={linkers} media={media} state={listing} onChange={setListing} shown={entries.length} />
        {data && all.length === 0 && !calendar && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>}
        {all.length > 0 && entries.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No entries match these filters.</p>}

        {calendar && (
          <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Loading calendar…</p>}>
            <CalendarView section={section} entries={entries} month={month} onMonth={setMonth} onAdd={(day) => open('new', { startDate: day })} />
          </Suspense>
        )}

        {!calendar && (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={`relative break-words rounded-lg border bg-white p-4 shadow-sm dark:bg-slate-900 ${chosen?.includes(entry.id) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-800'}`}
              >
                {chosen && (
                  <label className="-mt-1 mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input type="checkbox" checked={chosen.includes(entry.id)} onChange={() => tick(entry.id)} aria-label={`Select ${localize(section, entry)[section.titleField] || '(untitled)'}`} />
                    Select
                  </label>
                )}
                <CopyButton text={entryText(section, localize(section, entry), related, lang)} label={`the whole ${section.itemLabel ?? 'entry'}`} size={16} className="absolute top-2 right-2 p-1.5" />
                {/* Just the essentials; the summary opens the full card. Files show while selecting, to tick them one by one. */}
                <EntrySummary section={section} entry={entry} media={media} usedBy={section.key === LOCATION_LIST ? backlinksFor(entry) : undefined} />
                {chosen && <CardMedia section={section} entry={entry} media={media} selection={fileSelection} />}
                <div className="-mx-1 mt-3 flex flex-wrap gap-1 text-sm md:mx-0 md:gap-2">
                  {actions?.(entry)}
                  {/* A post downloads its own and its picked files together, from its page's own button. */}
                  {section.media && !section.fields.some((f) => f.type === 'media') && <DownloadEntry section={section} entry={entry} media={media} download={files} />}
                  <button
                    onClick={() => setExporting({ title: localize(section, entry)[section.titleField] || section.label, entries: [entry] })}
                    aria-label="Export"
                    title="Export to Word, Excel or PDF"
                    className="inline-flex items-center rounded px-3 py-2 text-slate-700 hover:bg-slate-100 md:px-2 md:py-1 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <FileOutput size={16} aria-hidden />
                  </button>
                  {/* Edit and delete sit in the card's bottom-right corner. */}
                  <span className="ml-auto flex gap-1 md:gap-2">
                    <button onClick={() => open(entry)} aria-label="Edit" title="Edit" className="inline-flex items-center rounded px-3 py-2 md:px-2 md:py-1 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button onClick={() => setConfirmDelete(entry)} aria-label="Delete" title="Delete" className="inline-flex items-center rounded px-3 py-2 md:px-2 md:py-1 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </span>
                </div>
                {files.error?.key === entry.id && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {files.error.message}
                  </p>
                )}
                {deleteError?.id === entry.id && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {deleteError.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PreviewProvider>
  );
}

/** List | Calendar, above the list of a section with a calendar (see SectionDef.calendar). */
function ViewSwitch({ view, onChange }: { view: ListView; onChange: (view: ListView) => void }) {
  const choices = [
    { view: 'list', label: 'List', Icon: List },
    { view: 'calendar', label: 'Calendar', Icon: CalendarDays },
  ] as const;
  return (
    <div role="group" aria-label="Show as" className="inline-grid grid-cols-2 rounded-md border border-slate-300 p-0.5 text-sm dark:border-slate-700">
      {choices.map(({ view: v, label, Icon }) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)} className={`inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 md:py-1 ${segmentClass(view === v)}`}>
          <Icon size={16} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/** How many entries a section has in all (drafts too), by its name in the heading and the phone's top bar. */
export function EntryTotal({ count }: { count: number }) {
  const text = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  return (
    <span title={`${text} in all`} className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <span aria-hidden>{count}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Download key of the page's Download button (entry buttons use the entry id). */
const PAGE = 'page';

/** An action in the tools panel: a full-width row. */
const panelButton =
  'flex w-full items-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 md:py-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

const toolButton = 'inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-blue-100 disabled:opacity-50 dark:hover:bg-blue-500/15';

/** A card's download button: the file itself, or a .zip when the entry has several. */
function DownloadEntry({ section, entry, media, download }: { section: SectionDef; entry: Entry; media: MediaItem[]; download: ReturnType<typeof useMediaDownload> }) {
  const files = zipPaths(section, [entry], media, { folders: false });
  if (!files.length) return null;
  const progress = download.progress?.key === entry.id ? download.progress : null;
  const label = progress
    ? `Preparing ${progress.done} of ${progress.total}`
    : files.length === 1
      ? 'Download file'
      : `Download all ${files.length} files`;
  const button = (
    <button
      onClick={() => download.download(files, `${entryFolderName(section, entry)}.zip`, entry.id)}
      disabled={!!download.progress}
      aria-label={label}
      title={progress || files.length === 1 ? label : `${label} (.zip)`}
      className={`inline-flex items-center gap-1 rounded px-3 py-2 md:px-2 md:py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 ${progress ? 'disabled:opacity-100' : ''}`}
    >
      {progress ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Download size={16} aria-hidden />}
      {progress && progress.total > 1 ? (
        <span aria-hidden className="tabular-nums">
          {progress.done}/{progress.total}
        </span>
      ) : (
        !progress && files.length > 1 && <span aria-hidden>{files.length}</span>
      )}
    </button>
  );
  if (!progress) return button;
  return (
    <>
      {button}
      <button
        onClick={download.cancel}
        aria-label="Cancel download"
        title="Cancel download"
        className="inline-flex items-center rounded px-3 py-2 text-slate-700 hover:bg-slate-100 md:px-2 md:py-1 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <X size={16} aria-hidden />
      </button>
    </>
  );
}
