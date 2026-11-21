import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getSection, type Entry } from '@profile/shared';
import ListControls, { FilterPanel } from '../../src/components/ListControls';
import type { ListingState } from '../../src/listing';

const activities = getSection('activities')!;
const entry = (name: string, category: string, extra: Record<string, string> = {}) => ({ id: name, name, category, createdAt: '', updatedAt: '', ...extra }) as Entry;
const entries = [entry('Talk', 'Seminar'), entry('Course', 'Training'), entry('Panel', 'Seminar')];
const state = (filters: Record<string, string> = {}): ListingState => ({ q: '', sort: '', dir: 'asc', filters });
const pills = (name: string) => within(screen.getByRole('group', { name })).getAllByRole('button').map((b) => b.textContent);

describe('FilterPanel', () => {
  it('offers the categories in use as pills with counts, and sets the filter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<FilterPanel section={activities} entries={entries} state={state()} onChange={onChange} />);
    expect(pills('Category')).toEqual(['All', 'Seminar 2', 'Training 1']);
    expect(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Seminar 2' }));
    expect(onChange).toHaveBeenLastCalledWith({ filters: { category: 'seminar' } });

    rerender(<FilterPanel section={activities} entries={entries} state={state({ category: 'seminar' })} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Seminar 2' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Training 1' }));
    expect(onChange).toHaveBeenLastCalledWith({ filters: { category: 'seminar\ntraining' } });
    await user.click(screen.getByRole('button', { name: 'Seminar 2' })); // again: off
    expect(onChange).toHaveBeenLastCalledWith({ filters: { category: '' } });
  });

  it('groups the filters, category first, with small fixed sets as pills and long lists as dropdowns', () => {
    const tagged = [
      entry('Talk', 'Seminar', { domain: 'Engineering', organizer: 'Fibo', locationType: 'Online', startDate: '2025-04-01', noEndDate: 'true', description: 'Hi' }),
      entry('Course', 'Training', { startDate: '2026-01-01' }),
    ];
    render(<FilterPanel section={activities} entries={tagged} state={state()} onChange={() => {}} />);
    const groups = screen.getAllByRole('region').map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('[role=group], label')].map((x) => x.getAttribute('aria-label') ?? x.firstChild?.textContent)]);
    expect(groups).toEqual([
      ['Topic', ['Category', 'Domain']],
      ['When', ['No end date', 'Year']],
      ['Progress', ['Progress', 'Thai']],
      ['Details', ['Organizer', 'Location type']],
    ]);
    // Worked out from the dates: the one-off talk is over, the course has no end date yet.
    expect(pills('Progress')).toEqual(['All', 'In Progress 1', 'Completed 1']);
    expect(pills('Year')).toEqual(['All', '2026 1', '2025 1']);
    expect(pills('No end date')).toEqual(['All', 'Yes 1', 'No 1']);
    expect(screen.getByRole('combobox', { name: 'Organizer' })).toBeInTheDocument();
  });

  it('resets every filter at once, and is off while none is on', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<FilterPanel section={activities} entries={entries} state={state()} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
    rerender(<FilterPanel section={activities} entries={entries} state={state({ category: 'seminar', thai: 'missing' })} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onChange).toHaveBeenLastCalledWith({ filters: expect.objectContaining({ category: '', thai: '' }) });
    expect(onChange.mock.lastCall![0]).not.toHaveProperty('q');
  });

  it('offers only the subdomains under the domains picked, keeping one already picked', () => {
    const tagged = [entry('Site', 'Seminar', { domain: 'Engineering', subdomain: 'DevOps' }), entry('Fern', 'Training', { domain: 'Biology', subdomain: 'Plant' })];
    const row = (filters: Record<string, string>) => {
      const { unmount } = render(<FilterPanel section={activities} entries={tagged} state={state(filters)} onChange={() => {}} />);
      const text = pills('Subdomain');
      unmount();
      return text;
    };
    expect(row({})).toEqual(['All', 'DevOps 1', 'Plant 1']);
    expect(row({ domain: 'biology' })).toEqual(['All', 'Plant 1']);
    expect(row({ domain: 'biology', subdomain: 'devops' })).toEqual(['All', 'DevOps 1', 'Plant 1']);
  });

  it('shows nothing for sections with nothing to filter', () => {
    const { container } = render(<FilterPanel section={getSection('skills')!} entries={[]} state={state()} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('sort order', () => {
  it('names each direction in words that fit what is sorted, the usual one first', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ListControls section={activities} state={{ ...state(), dir: 'desc' }} onChange={onChange} />);
    // Activities sort by start date at first: newest first.
    const order = () => within(screen.getByRole('group', { name: 'Order' })).getAllByRole('button');
    expect(order().map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Newest first', 'true'],
      ['Oldest first', 'false'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Oldest first' }));
    expect(onChange).toHaveBeenLastCalledWith({ dir: 'asc' });

    rerender(<ListControls section={activities} state={{ ...state(), sort: 'title', dir: 'asc' }} onChange={onChange} />);
    expect(order().map((b) => b.textContent)).toEqual(['A to Z', 'Z to A']);
    rerender(<ListControls section={activities} state={{ ...state(), sort: 'duration', dir: 'desc' }} onChange={onChange} />);
    expect(order().map((b) => b.textContent)).toEqual(['Longest first', 'Shortest first']);
  });
});
