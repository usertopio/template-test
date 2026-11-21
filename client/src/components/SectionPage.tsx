import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ORGANIZATIONS, getSection, organizationSections, orgKey, referencingSections, splitList, type Entry, type SectionDef } from '@profile/shared';
import { useDeleteEntry, useEntries, useEntriesBySection, useSaveEntry } from '../api';
import EntryForm from './EntryForm';
import Modal from './Modal';

interface Props {
  section: SectionDef;
  /** Extra controls rendered next to the "Add" button. */
  toolbar?: ReactNode;
  filter?: (entry: Entry) => boolean;
  /** Extra per-card actions. */
  actions?: (entry: Entry) => ReactNode;
}

/** An entry in another section that links to one of this section's entries. */
interface Backlink {
  section: SectionDef;
  entry: Entry;
}

const dateKey = (e: Entry) => e.startDate || e.issueDate || e.postedDate || e.scheduledDate || e.createdAt;

/** Newest first for dated sections (experience, posts…), otherwise A–Z by title (skills, organizations). */
function compareEntries(section: SectionDef): (a: Entry, b: Entry) => number {
  if (section.fields.some((f) => f.type === 'date')) return (a, b) => dateKey(b).localeCompare(dateKey(a));
  return (a, b) => (a[section.titleField] ?? '').localeCompare(b[section.titleField] ?? '', undefined, { sensitivity: 'base' });
}

/** Generic list + add/edit/delete page for a list section. */
export default function SectionPage({ section, toolbar, filter, actions }: Props) {
  const { data, isLoading, error } = useEntries(section.key);
  const save = useSaveEntry(section.key);
  const remove = useDeleteEntry(section.key);
  // null = closed, 'new' = adding, otherwise the entry being edited
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Sections this one links to (forward refs) and sections linking to it (backlinks).
  const refSections = [...new Set(section.fields.filter((f) => f.type === 'refs').map((f) => f.refSection!))];
  const backSections = referencingSections(section.key);
  // On the Organizations page, entries point at an organization by name rather than id.
  const orgSources = section.key === ORGANIZATIONS ? organizationSections() : [];
  const related = useEntriesBySection([...new Set([...refSections, ...backSections.map((b) => b.section.key), ...orgSources.map((o) => o.section.key)])]);
  const backlinks = collectBacklinks(backSections, related);
  const orgUsage = collectOrgUsage(orgSources, related);
  const backlinksFor = (e: Entry) => [...(backlinks.get(e.id) ?? []), ...(orgUsage.get(orgKey(e.name)) ?? [])];

  const entries = (data ?? []).filter(filter ?? (() => true)).sort(compareEntries(section));

  function open(target: Entry | 'new') {
    setDirty(false);
    setConfirmDiscard(false);
    setEditing(target);
  }
  const close = () => setEditing(null);
  const requestClose = () => (dirty ? setConfirmDiscard(true) : close());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        {/* On mobile the sticky top bar already shows the section name. */}
        <h1 className="hidden text-2xl font-semibold md:block">{section.label}</h1>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
          {toolbar}
          <button onClick={() => open('new')} className="hidden rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 md:inline-flex">
            + Add
          </button>
        </div>
      </header>

      {/* Mobile floating add button */}
      <button
        onClick={() => open('new')}
        aria-label={`Add ${section.label.toLowerCase()}`}
        className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-900/30 hover:bg-blue-700 active:scale-95 md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Modal open={editing !== null} title={editing === 'new' ? `New ${section.label.toLowerCase()} entry` : `Edit ${section.label.toLowerCase()}`} onRequestClose={requestClose}>
        {editing && (
          <EntryForm
            key={editing === 'new' ? 'new' : editing.id}
            variant="modal"
            section={section}
            initial={editing === 'new' ? null : editing}
            onDirtyChange={setDirty}
            onCancel={requestClose}
            onSubmit={async (values) => {
              await save.mutateAsync({ id: editing === 'new' ? undefined : editing.id, data: values });
              close();
            }}
            notice={
              confirmDiscard && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Discard unsaved changes?
                  <span className="flex gap-2">
                    <button type="button" onClick={close} className="rounded bg-amber-600 px-3 py-2 md:px-2 md:py-1 text-white hover:bg-amber-700">
                      Discard
                    </button>
                    <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded px-3 py-2 md:px-2 md:py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                      Keep editing
                    </button>
                  </span>
                </div>
              )
            }
          />
        )}
      </Modal>

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
      {data && entries.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>}

      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="break-words rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <EntryCard section={section} entry={entry} related={related} backlinks={backlinksFor(entry)} />
            <div className="-mx-1 mt-3 flex flex-wrap gap-1 text-sm md:mx-0 md:gap-2">
              {actions?.(entry)}
              <button onClick={() => open(entry)} className="rounded px-3 py-2 md:px-2 md:py-1 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                Edit
              </button>
              {confirmDelete === entry.id ? (
                <>
                  <button
                    onClick={() => remove.mutate(entry.id, { onSettled: () => setConfirmDelete(null) })}
                    disabled={remove.isPending}
                    className="rounded bg-red-600 px-3 py-2 md:px-2 md:py-1 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm delete
                  </button>
                  <button onClick={() => setConfirmDelete(null)} className="rounded px-3 py-2 md:px-2 md:py-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Keep
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(entry.id)} className="rounded px-3 py-2 md:px-2 md:py-1 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Map of target entry id -> entries (in other sections) that link to it. */
function collectBacklinks(backSections: ReturnType<typeof referencingSections>, related: Map<string, Entry[]>): Map<string, Backlink[]> {
  const out = new Map<string, Backlink[]>();
  for (const { section, fields } of backSections) {
    for (const entry of related.get(section.key) ?? []) {
      for (const id of new Set(fields.flatMap((f) => splitList(entry[f.key])))) {
        out.set(id, [...(out.get(id) ?? []), { section, entry }]);
      }
    }
  }
  return out;
}

/** Map of normalized organization name -> entries naming that organization. */
function collectOrgUsage(sources: ReturnType<typeof organizationSections>, related: Map<string, Entry[]>): Map<string, Backlink[]> {
  const out = new Map<string, Backlink[]>();
  for (const { section, fields } of sources) {
    for (const entry of related.get(section.key) ?? []) {
      for (const key of new Set(fields.map((f) => orgKey(entry[f.key])).filter(Boolean))) {
        out.set(key, [...(out.get(key) ?? []), { section, entry }]);
      }
    }
  }
  return out;
}

const chipClass = 'rounded-full px-2 py-0.5 text-xs';

function EntryCard({ section, entry, related, backlinks }: { section: SectionDef; entry: Entry; related: Map<string, Entry[]>; backlinks: Backlink[] }) {
  const subtitle = (section.subtitleFields ?? []).map((k) => entry[k]).filter(Boolean).join(' · ');
  const dates = entry.startDate ? `${entry.startDate} – ${entry.current === 'true' ? 'Present' : entry.endDate || '…'}` : '';
  const body = section.fields.find((f) => f.type === 'textarea' && entry[f.key]);
  const tags = section.fields.filter((f) => f.type === 'tags').flatMap((f) => splitList(entry[f.key]));
  // Linked entries that still exist (stale ids from hand-edited sheets are ignored).
  const links = section.fields
    .filter((f) => f.type === 'refs')
    .flatMap((f) => {
      const target = getSection(f.refSection!)!;
      const byId = new Map((related.get(target.key) ?? []).map((e) => [e.id, e]));
      return splitList(entry[f.key]).flatMap((id) => (byId.has(id) ? [{ target, linked: byId.get(id)! }] : []));
    });

  return (
    <div>
      <h3 className="font-medium">{entry[section.titleField] || '(untitled)'}</h3>
      {subtitle && <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      {dates && <p className="text-xs text-slate-500 dark:text-slate-400">{dates}</p>}
      {body && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{entry[body.key]}</p>}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className={`${chipClass} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300`}>
              {t}
            </span>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {links.map(({ target, linked }) => {
            const label = `🏅 ${linked[target.titleField] || '(untitled)'}`;
            const cls = `${chipClass} bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200`;
            return linked.credentialUrl ? (
              <a key={linked.id} href={linked.credentialUrl} target="_blank" rel="noreferrer" className={`${cls} hover:underline`}>
                {label} ↗
              </a>
            ) : (
              <span key={linked.id} className={cls}>
                {label}
              </span>
            );
          })}
        </div>
      )}
      {backlinks.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          Linked to:
          {backlinks.map(({ section: s, entry: e }) => (
            <Link key={`${s.key}-${e.id}`} to={`/${s.key}`} className={`${chipClass} bg-blue-50 text-blue-700 hover:underline dark:bg-blue-500/15 dark:text-blue-300`}>
              {s.label}: {e[s.titleField] || '(untitled)'}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
