import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import FullCalendar, { type CalendarRef } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import listPlugin from '@fullcalendar/react/list';
import classicTheme from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import './calendar.css';
import { localToday, type Entry, type SectionDef } from '@profile/shared';
import { useLocalize } from '../language';
import { calendarPlan, monthOnlyIn, shiftMonth, type CalendarEventProps } from '../calendar';
import { useOpenPreview } from './preview';

interface Props {
  section: SectionDef;
  /** The entries shown: the list's search and filters apply here too. */
  entries: Entry[];
  /** 'YYYY-MM' */
  month: string;
  onMonth: (month: string) => void;
  /** A day's number clicked: add an entry starting that day ('YYYY-MM-DD'). */
  onAdd: (day: string) => void;
}

/** Wide enough for a month grid with names on its bars (Tailwind's md); narrower, the month is a list by day. */
const WIDE = '(min-width: 768px)';
/** A mouse or trackpad, which can hover; a touch screen can't, and double-taps are unreliable there. */
const POINTER = '(hover: hover)';
function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? true,
  );
}

/** Marks an event's element with its entry, so every piece of one entry can be highlighted together. */
const ENTRY_ATTR = 'data-calendar-entry';

const monthTitle = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const navButton = 'inline-flex items-center rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent md:py-1.5 dark:text-slate-300 dark:hover:bg-slate-800';

/**
 * A list page's entries on a month calendar (see calendarPlan): a bar for the days each one runs, dots on its
 * application dates. With a mouse, hovering one highlights all of it (each week of a long bar, its dots), a click
 * keeps it highlighted (another click lets go) and a double click opens its popup, as its card does; from the
 * keyboard Space and Enter do the same. On a touch screen a tap opens it. Clicking a day's number adds one starting
 * that day (a link, so it works from the keyboard too, and on a phone's list the day headings do the same).
 * Loaded only when shown, with the calendar library.
 */
export default function CalendarView({ section, entries, month, onMonth, onAdd }: Props) {
  const calendar = useRef<CalendarRef>(null);
  const openPreview = useOpenPreview();
  const localize = useLocalize();
  const wide = useMedia(WIDE);
  // Hover, click to keep and double-click to open need a pointer that hovers; on a touch screen a tap opens.
  const pinning = useMedia(POINTER);
  const [hovered, setHovered] = useState<string | null>(null);
  // Highlighted by a click until clicked again, kept from month to month.
  const [pinned, setPinned] = useState<string[]>([]);
  const today = localToday();
  const plan = calendarPlan(entries, (e) => localize(section, e)[section.titleField], today);
  // A phone's list shows each one as a dot by its name: the pale fill of a bar would barely show, so the dot takes
  // the bar's text color.
  const events = wide ? plan.events : plan.events.map((e) => ({ ...e, color: e.contrastColor ?? e.color }));
  const monthOnly = monthOnlyIn(plan.monthOnly, month);
  const open = (id: string) => openPreview?.({ section: section.key, id });
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  /**
   * Shows on an event's element whether its entry is hovered or kept highlighted. Set on the elements rather than
   * through the events' classes: new classes would make the calendar redraw the event under the mouse.
   */
  const mark = (el: HTMLElement) => {
    const id = el.getAttribute(ENTRY_ATTR)!;
    el.toggleAttribute('data-hovered', pinning && id === hovered);
    if (pinning) el.setAttribute('aria-pressed', String(pinned.includes(id)));
    else el.removeAttribute('aria-pressed');
  };
  // Across the document: a day's "+ more" list opens in a popover of its own.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(`[${ENTRY_ATTR}]`).forEach(mark);
  });
  const plural = section.label.toLowerCase();
  const item = section.itemLabel ?? 'entry';

  // The URL's month (?month=) leads; the calendar has no toolbar of its own and just follows it.
  useEffect(() => {
    calendar.current?.getApi().gotoDate(`${month}-01`);
  }, [month]);

  const chip = (entry: Entry) => (
    <button
      key={entry.id}
      type="button"
      onClick={() => open(entry.id)}
      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {localize(section, entry)[section.titleField] || '(untitled)'}
    </button>
  );

  return (
    <section aria-label="Calendar" className="space-y-3">
      <div className="flex items-center gap-1">
        <h2 className="mr-auto text-lg font-semibold">{monthTitle(month)}</h2>
        {pinning && pinned.length > 0 && (
          <button type="button" onClick={() => setPinned([])} className={navButton}>
            <X size={16} aria-hidden className="mr-1" />
            Clear highlights
          </button>
        )}
        <button type="button" onClick={() => onMonth(today.slice(0, 7))} disabled={month === today.slice(0, 7)} className={navButton}>
          Today
        </button>
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month" title="Previous month" className={navButton}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month" title="Next month" className={navButton}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      {monthOnly.length > 0 && (
        <div role="group" aria-label="This month, no exact day" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <span className="mr-1">This month, no exact day:</span>
          {monthOnly.map(chip)}
        </div>
      )}

      <div className={`calendar-days ${wide ? '' : 'calendar-list'} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900`}>
        <FullCalendar
          // A phone gets the month as a list by day: bars across seven narrow columns would hide the names.
          key={wide ? 'grid' : 'list'}
          ref={calendar}
          plugins={[dayGridPlugin, listPlugin, classicTheme]}
          initialView={wide ? 'dayGridMonth' : 'listMonth'}
          initialDate={`${month}-01`}
          headerToolbar={false}
          firstDay={1}
          fixedWeekCount={false}
          height="auto"
          dayMaxEventRows={4}
          borderless
          eventInteractive
          events={events}
          // Every one lasts whole days, so there's no time to show ("All-day" on each line of a phone's list).
          displayEventTime={false}
          eventDidMount={(info) => {
            const { entryId, kind } = info.event.extendedProps as CalendarEventProps;
            // A bar cuts a long name short; hovering shows it whole.
            info.el.title = info.event.title;
            info.el.setAttribute(ENTRY_ATTR, entryId);
            // A bar is filled pale with its color in its text; a dot is the strong color itself (see calendar.css).
            info.el.setAttribute('data-calendar-kind', kind === 'run' ? 'bar' : 'dot');
            mark(info.el);
            info.el.addEventListener('dblclick', () => open(entryId));
          }}
          eventMouseEnter={(info) => setHovered((info.event.extendedProps as CalendarEventProps).entryId)}
          eventMouseLeave={(info) => setHovered((h) => (h === (info.event.extendedProps as CalendarEventProps).entryId ? null : h))}
          eventClick={(info) => {
            const { entryId } = info.event.extendedProps as CalendarEventProps;
            info.jsEvent.preventDefault();
            // The calendar sends Enter and Space here too, as a click: Enter opens, Space toggles like a click.
            // A double click toggles twice, so it opens with the highlight as it was.
            const enter = info.jsEvent.type === 'keydown' && (info.jsEvent as unknown as KeyboardEvent).key === 'Enter';
            if (pinning && !enter) togglePin(entryId);
            else open(entryId);
          }}
          navLinks
          navLinkDayClick={(date) => onAdd(localToday(date))}
          navLinkHint={(dateText: string) => `Add ${/^[aeiou]/.test(item) ? 'an' : 'a'} ${item} on ${dateText}`}
          noEventsText={`No ${plural} this month`}
        />
      </div>

      {plan.undated.length > 0 && (
        <div role="group" aria-label="Not on the calendar" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <span className="mr-1">
            No dates yet, so not on the calendar ({plan.undated.length}):
          </span>
          {plan.undated.map(chip)}
        </div>
      )}
    </section>
  );
}
