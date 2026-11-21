// A type only: the calendar library itself loads with the calendar (CalendarView), never with the list.
import type { EventInput } from '@fullcalendar/react';
import { isDraft, progressOf, type Entry, type Progress } from '@profile/shared';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** What a calendar event stands for: the days an entry runs, or one of its application dates. */
export type CalendarEventKind = 'run' | 'deadline' | 'results';

/** Kept on each event (its `extendedProps`) for clicks and styling. */
export interface CalendarEventProps {
  entryId: string;
  kind: CalendarEventKind;
}

/** An entry dated by month alone ('2026-10'): it has no day to sit on, so it's listed above the grid in its months. */
export interface MonthOnly {
  entry: Entry;
  from: string;
  to: string;
}

export interface CalendarPlan {
  events: EventInput[];
  monthOnly: MonthOnly[];
  /** Nothing to place: no start date, deadline or results date. */
  undated: Entry[];
}

/** The day after `day` ('YYYY-MM-DD'), counted in UTC so no time zone moves it. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The month `by` months from `month` ('YYYY-MM'). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** The name of a progress's colors in calendar.css (--cal-in-progress, --cal-in-progress-fg). */
export const progressSlug = (progress: Progress | '') => (progress ? progress.toLowerCase().replace(/\s+/g, '-') : 'none');

const MARKERS = [
  { kind: 'deadline', key: 'applicationDeadline', label: 'Deadline' },
  { kind: 'results', key: 'resultsDate', label: 'Results' },
] as const;

/**
 * Where each entry goes on the calendar: a bar from its start date through its end date (one day with "No end
 * date" ticked; just the start day, marked →, while the end isn't known yet), a dot on its application deadline and
 * results date, colored like its progress badge. `title` is its name as shown (in the profile's language).
 */
export function calendarPlan(entries: Entry[], title: (entry: Entry) => string, today: string): CalendarPlan {
  const plan: CalendarPlan = { events: [], monthOnly: [], undated: [] };
  for (const entry of entries) {
    const name = title(entry) || '(untitled)';
    const start = entry.startDate?.trim() ?? '';
    const end = entry.noEndDate === 'true' ? '' : (entry.endDate?.trim() ?? '');
    const progress = progressOf(entry, today);
    const className = [isDraft(entry) && 'opacity-60', progress.startsWith('Cancelled') && 'line-through'].filter(Boolean).join(' ');
    let placed = false;

    if (DAY.test(start)) {
      const open = entry.noEndDate !== 'true' && !end;
      // The calendar's end is exclusive: the day after the last one (or the 1st after a month alone). An end
      // before the start, a typo in the sheet, leaves just the start day.
      const until = DAY.test(end) && end >= start ? nextDay(end) : MONTH.test(end) && end >= start.slice(0, 7) ? `${shiftMonth(end, 1)}-01` : undefined;
      const slug = progressSlug(progress);
      plan.events.push({
        id: `${entry.id}:run`,
        title: open ? `${name} →` : name,
        start,
        end: until,
        allDay: true,
        color: `var(--cal-${slug})`,
        contrastColor: `var(--cal-${slug}-fg)`,
        className,
        extendedProps: { entryId: entry.id, kind: 'run' } satisfies CalendarEventProps,
      });
      placed = true;
    } else if (MONTH.test(start)) {
      const last = DAY.test(end) || MONTH.test(end) ? end.slice(0, 7) : '';
      plan.monthOnly.push({ entry, from: start, to: last > start ? last : start });
      placed = true;
    }

    for (const { kind, key, label } of MARKERS) {
      const day = entry[key]?.trim() ?? '';
      if (!DAY.test(day)) continue;
      plan.events.push({
        id: `${entry.id}:${kind}`,
        title: `${label}: ${name}`,
        start: day,
        allDay: true,
        display: 'list-item',
        color: `var(--cal-${kind})`,
        className,
        extendedProps: { entryId: entry.id, kind } satisfies CalendarEventProps,
      });
      placed = true;
    }

    if (!placed) plan.undated.push(entry);
  }
  return plan;
}

/** The month-only entries to list while `month` is shown. */
export const monthOnlyIn = (items: MonthOnly[], month: string) => items.filter((i) => i.from <= month && month <= i.to).map((i) => i.entry);
