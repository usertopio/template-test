import { describe, expect, it } from 'vitest';
import type { Entry } from '@profile/shared';
import { calendarPlan, monthOnlyIn, nextDay, progressSlug, shiftMonth } from '../../src/calendar';

const TODAY = '2026-10-17';
const activity = (fields: Record<string, string>): Entry => ({ id: 'a1', name: 'AWS Summit', createdAt: '', updatedAt: '', ...fields });
const plan = (...entries: Entry[]) => calendarPlan(entries, (e) => e.name, TODAY);
const run = (entry: Entry) => plan(entry).events.find((e) => e.id === `${entry.id}:run`);

describe('date helpers', () => {
  it('step over month ends, leap days and years', () => {
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('calendarPlan', () => {
  it('runs a bar from the start date through the end date, across months', () => {
    // The calendar's end is exclusive, so the bar's end is the day after the last.
    expect(run(activity({ startDate: '2026-10-30', endDate: '2026-11-02' }))).toMatchObject({ title: 'AWS Summit', start: '2026-10-30', end: '2026-11-03', allDay: true });
  });

  it('puts one with No end date on its day alone', () => {
    expect(run(activity({ startDate: '2026-10-05', endDate: '2026-10-09', noEndDate: 'true' }))).toMatchObject({ title: 'AWS Summit', start: '2026-10-05', end: undefined });
  });

  it('marks one whose end is not known yet with an arrow, on its start day', () => {
    expect(run(activity({ startDate: '2026-10-05' }))).toMatchObject({ title: 'AWS Summit →', start: '2026-10-05', end: undefined });
  });

  it('runs to the end of a month given alone as the end', () => {
    expect(run(activity({ startDate: '2026-12-20', endDate: '2026-12' }))?.end).toBe('2027-01-01');
  });

  it('ignores an end before the start, leaving the start day', () => {
    expect(run(activity({ startDate: '2026-10-05', endDate: '2026-09-30' }))).toMatchObject({ start: '2026-10-05', end: undefined });
  });

  it('lists one dated by month alone in each month it spans, not on a day', () => {
    const p = plan(activity({ startDate: '2026-10', endDate: '2026-12-15' }));
    expect(p.events).toEqual([]);
    expect(p.monthOnly).toEqual([{ entry: expect.objectContaining({ id: 'a1' }), from: '2026-10', to: '2026-12' }]);
    expect(monthOnlyIn(p.monthOnly, '2026-11').map((e) => e.id)).toEqual(['a1']);
    expect(monthOnlyIn(p.monthOnly, '2027-01')).toEqual([]);
  });

  it('adds a dot on the application deadline and the results date, but not on a month alone', () => {
    const p = plan(activity({ applicationDeadline: '2026-10-20', resultsDate: '2026-11-05', startDate: '2026-12' }));
    expect(p.events.map((e) => [e.title, e.start, e.display])).toEqual([
      ['Deadline: AWS Summit', '2026-10-20', 'list-item'],
      ['Results: AWS Summit', '2026-11-05', 'list-item'],
    ]);
    expect(plan(activity({ applicationDeadline: '2026-10' })).events).toEqual([]);
  });

  it('keeps aside the entries with no date to place', () => {
    const p = plan(activity({}), activity({ id: 'a2', startDate: '2026-10-05' }));
    expect(p.undated.map((e) => e.id)).toEqual(['a1']);
  });

  it('colors a bar by its progress, crossing out a cancelled one and fading a draft', () => {
    expect(run(activity({ startDate: '2026-10-01', endDate: '2026-10-02' }))).toMatchObject({ color: 'var(--cal-completed)', contrastColor: 'var(--cal-completed-fg)', className: '' });
    expect(run(activity({ startDate: '2026-10-15', endDate: '2026-10-20' }))?.color).toBe('var(--cal-in-progress)');
    expect(run(activity({ startDate: '2026-11-01', progress: 'Cancelled by Applicant' }))).toMatchObject({ color: 'var(--cal-cancelled-by-applicant)', className: 'line-through' });
    expect(run(activity({ startDate: '2026-11-01', draft: 'true' }))?.className).toBe('opacity-60');
  });

  it('names every progress after a color in calendar.css', () => {
    expect(progressSlug('Awaiting Results')).toBe('awaiting-results');
    expect(progressSlug('')).toBe('none');
  });
});
