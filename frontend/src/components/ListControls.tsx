import { useSearchParams } from 'react-router';
import { RotateCcw } from 'lucide-react';
import type { Entry, MediaItem, SectionDef } from '@profile/shared';
import { FILTER_GROUPS, FILTER_SEP, defaultSort, filterOptions, filterValues, sortOptions, type FilterOption, type Linkers, type ListingState, type SortDir } from '../listing';

/** How the list is shown (?view=calendar&month=2026-10, see useListView): kept as the search and filters change. */
const VIEW_PARAMS = ['view', 'month'];
const RESERVED = ['q', 'sort', 'dir', ...VIEW_PARAMS];

/**
 * Search / sort / filter state kept in the URL (?q=&sort=&dir=&<filter>=), so reloads and Back keep it. A filter
 * with several values repeats its parameter (?domain=Engineering&domain=Film).
 */
export function useListingState(section: SectionDef): [ListingState, (patch: Partial<ListingState>) => void] {
  const [params, setParams] = useSearchParams();
  const fallback = defaultSort(section);
  const sort = sortOptions(section).find((o) => o.id === params.get('sort')) ?? fallback;
  const state: ListingState = {
    q: params.get('q') ?? '',
    sort: sort.id,
    dir: (params.get('dir') as SortDir | null) ?? sort.defaultDir,
    filters: Object.fromEntries([...new Set(params.keys())].filter((k) => !RESERVED.includes(k)).map((k) => [k, params.getAll(k).join(FILTER_SEP)])),
  };

  function update(patch: Partial<ListingState>) {
    const next = { ...state, ...patch, filters: { ...state.filters, ...patch.filters } };
    const out = new URLSearchParams();
    if (next.q) out.set('q', next.q);
    const nextSort = sortOptions(section).find((o) => o.id === next.sort) ?? fallback;
    if (nextSort.id !== fallback.id) out.set('sort', nextSort.id);
    if (next.dir !== nextSort.defaultDir) out.set('dir', next.dir);
    for (const [k, v] of Object.entries(next.filters)) for (const value of filterValues(v)) out.append(k, value);
    for (const k of VIEW_PARAMS) if (params.has(k)) out.set(k, params.get(k)!);
    setParams(out, { replace: true });
  }

  return [state, update];
}

export type ListView = 'list' | 'calendar';

/** A month as 'YYYY-MM'. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Whether a list page shows its list or its calendar, and the calendar's month (this month unless the URL says
 * another), kept in the URL beside the filters so a reload or a shared link opens the same view.
 */
export function useListView(section: SectionDef, thisMonth: string): { view: ListView; month: string; setView: (view: ListView) => void; setMonth: (month: string) => void } {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? '';
  const change = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  return {
    view: section.calendar && params.get('view') === 'calendar' ? 'calendar' : 'list',
    month: MONTH.test(month) ? month : thisMonth,
    // The list is the default, so it leaves no trace in the URL; neither does this month.
    setView: (view) => change('view', view === 'calendar' ? view : null),
    setMonth: (m) => change('month', m === thisMonth ? null : m),
  };
}

const controlClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface Props {
  section: SectionDef;
  entries: Entry[];
  /** Entries linking these, for filters such as "Not in a post yet". */
  linkers?: Linkers;
  /** The files, for the Media filter. */
  media?: MediaItem[];
  state: ListingState;
  onChange: (patch: Partial<ListingState>) => void;
  shown: number;
}

/**
 * The search box. The same search shows in the tools panel and at the top of the page (in the header, or above the
 * list on a phone): they share the URL's ?q=, so typing in one fills the others.
 */
export function SearchBox({ section, state, onChange, className = '' }: Pick<Props, 'section' | 'state' | 'onChange'> & { className?: string }) {
  return (
    <input
      type="search"
      aria-label={`Search ${section.label.toLowerCase()}`}
      placeholder={`Search ${section.label.toLowerCase()}…`}
      value={state.q}
      onChange={(e) => onChange({ q: e.target.value })}
      className={`${controlClass} ${className}`}
    />
  );
}

/** Search and sort, stacked to fit the tools panel. `sortable` false: no sort (a calendar places entries by date). */
export default function ListControls({ section, state, onChange, sortable = true }: Pick<Props, 'section' | 'state' | 'onChange'> & { sortable?: boolean }) {
  const sorts = sortOptions(section);
  const sort = sorts.find((o) => o.id === state.sort) ?? defaultSort(section);

  return (
    <div className="space-y-3">
      <SearchBox section={section} state={state} onChange={onChange} className="w-full" />
      {sortable && (
        <>
          <select
            aria-label="Sort by"
            value={sort.id}
            onChange={(e) => onChange({ sort: e.target.value, dir: sorts.find((o) => o.id === e.target.value)!.defaultDir })}
            className={`${controlClass} w-full`}
          >
            {sorts.map((o) => (
              <option key={o.id} value={o.id}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          {/* The usual direction first ("Newest first" for a date). */}
          <div role="group" aria-label="Order" className="grid grid-cols-2 rounded-md border border-slate-300 p-0.5 text-sm dark:border-slate-700">
            {[sort.defaultDir, sort.defaultDir === 'asc' ? ('desc' as const) : ('asc' as const)].map((dir) => (
              <button
                key={dir}
                type="button"
                aria-pressed={state.dir === dir}
                onClick={() => onChange({ dir })}
                className={`rounded px-2 py-1.5 md:py-1 ${segmentClass(state.dir === dir)}`}
              >
                {sort.dirLabels[dir]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A choice in a row of them (Newest first | Oldest first, List | Calendar): the picked one filled in. */
export const segmentClass = (picked: boolean) => (picked ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800');

/**
 * Every filter, grouped (see FILTER_GROUPS) under headings: a few fixed choices as pills (several can be picked;
 * All clears them), open-ended lists as dropdowns. Reset filters clears them all, leaving the search.
 */
export function FilterPanel({ section, entries, linkers, media, state, onChange }: Omit<Props, 'shown'>) {
  const all = filterOptions(section, entries, linkers, media);
  if (!all.length) return null;
  const on = all.filter((f) => state.filters[f.key]).length;
  return (
    <div role="group" aria-label="Filters" className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filters</span>
        <button
          type="button"
          onClick={() => onChange({ filters: Object.fromEntries(all.map((f) => [f.key, ''])) })}
          disabled={!on}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50 disabled:text-slate-400 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-blue-500/10 dark:disabled:text-slate-600"
        >
          <RotateCcw size={14} aria-hidden />
          Reset filters
        </button>
      </div>
      {FILTER_GROUPS.map((group) => {
        // The category leads its group, as it leads the cards.
        const filters = all.filter((f) => f.group === group).sort((a, b) => Number(b.key === 'category') - Number(a.key === 'category'));
        if (!filters.length) return null;
        return (
          <section key={group} aria-label={group} className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{group}</h3>
            {filters.map((f) =>
              f.pills ? (
                <PillFilter key={f.key} section={section} option={f} all={all} entries={entries} state={state} onChange={onChange} />
              ) : (
                // The field's name sits above its dropdown, so the choices are just the values ("Fibo", not "Organizer: Fibo").
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{f.label}</span>
                  <select
                    value={state.filters[f.key] ?? ''}
                    onChange={(e) => onChange({ filters: { [f.key]: e.target.value } })}
                    className={`${controlClass} w-full ${state.filters[f.key] ? 'border-blue-500 dark:border-blue-500' : ''}`}
                  >
                    <option value="">Any</option>
                    {/* Several picked (e.g. from a shared link): shown as such until one is picked here. */}
                    {filterValues(state.filters[f.key]).length > 1 && <option value={state.filters[f.key]}>{filterValues(state.filters[f.key]).length} picked</option>}
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </section>
        );
      })}
    </div>
  );
}

/** How many filters are on (search aside), e.g. for the tools button. */
export function activeFilters(section: SectionDef, entries: Entry[], linkers: Linkers | undefined, state: ListingState, media?: MediaItem[]): number {
  return filterOptions(section, entries, linkers, media).filter((f) => state.filters[f.key]).length;
}

/**
 * "Showing 3 of 10 · Clear" above the list while a search or filter narrows it, so it's plain even with the tools
 * panel closed.
 */
export function NarrowedNotice({ section, entries, linkers, media, state, onChange, shown }: Props) {
  const filters = filterOptions(section, entries, linkers, media);
  if (!state.q && !filters.some((f) => state.filters[f.key])) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      Showing {shown} of {entries.length}
      <button
        type="button"
        onClick={() => onChange({ q: '', filters: Object.fromEntries(filters.map((f) => [f.key, ''])) })}
        className="rounded px-2 py-1 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
      >
        Clear
      </button>
    </p>
  );
}

/**
 * One filter as pills: All, then each choice with how many entries it has. A subdomain offers only what's under
 * the domains picked (and whatever subdomain is already picked, so a filter in force never hides).
 */
function PillFilter({ section, option, all, entries, state, onChange }: { section: SectionDef; option: FilterOption; all: FilterOption[]; entries: Entry[]; state: ListingState; onChange: (patch: Partial<ListingState>) => void }) {
  const picked = filterValues(state.filters[option.key]);
  const parent = section.fields.find((f) => f.key === option.key)?.parent;
  const parentOption = parent && all.find((p) => p.key === parent);
  const under = parent ? filterValues(state.filters[parent]) : [];
  const shown = parentOption && under.length ? entries.filter((e) => under.some((v) => parentOption.matches(e, v))) : entries;
  const choices = option.options.filter((opt) => picked.includes(opt.value) || shown.some((e) => option.matches(e, opt.value)));
  if (!choices.length) return null;
  const toggle = (value: string) => (picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]).join(FILTER_SEP);
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm md:py-1 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;
  return (
    <div role="group" aria-label={option.label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="w-full text-xs font-medium text-slate-500 dark:text-slate-400">
        {option.label}
      </span>
      <button type="button" aria-pressed={!picked.length} onClick={() => onChange({ filters: { [option.key]: '' } })} className={chip(!picked.length)}>
        All
      </button>
      {choices.map((opt) => (
        <button key={opt.value} type="button" aria-pressed={picked.includes(opt.value)} onClick={() => onChange({ filters: { [option.key]: toggle(opt.value) } })} className={chip(picked.includes(opt.value))}>
          {opt.label} <span className="opacity-70">{entries.filter((e) => option.matches(e, opt.value)).length}</span>
        </button>
      ))}
    </div>
  );
}
