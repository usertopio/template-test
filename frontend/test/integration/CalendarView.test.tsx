// The Activities page's calendar: the same entries as the list, placed by date, opening the same popups.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import SectionPage from '../../src/components/SectionPage';
import { mockApi, renderWithQuery } from '../helpers';

const activities = getSection('activities')!;

function mockActivities() {
  return mockApi({
    '/api/sections/activities': [
      { id: 'a1', name: 'AWS Summit', category: 'Conference', startDate: '2026-10-05', endDate: '2026-10-07', createdAt: '', updatedAt: '' },
      { id: 'a2', name: 'Film Meetup', category: 'Meetup', startDate: '2026-11-12', noEndDate: 'true', createdAt: '', updatedAt: '' },
      { id: 'a3', name: 'Reef talk', category: 'Seminar', createdAt: '', updatedAt: '' },
      // Friday to Tuesday, so its bar runs over two weeks, with a deadline dot the week before.
      { id: 'a4', name: 'Hackathon', category: 'Competition', applicationDeadline: '2026-10-02', startDate: '2026-10-09', endDate: '2026-10-13', createdAt: '', updatedAt: '' },
    ],
    '/api/sections/posts': [],
    '/api/sections/organizations': [],
    '/api/sections/skills': [],
    '/api/sections/certifications': [],
    '/api/sections/certificates': [],
    '/api/sections/projects': [],
    '/api/sections/experience': [],
    '/api/sections/education': [],
    '/api/sections/volunteer': [],
    '/api/sections/locations': [],
    '/api/sections/domains': [],
    '/api/media': [],
  });
}

/** The page's address, to check what the URL keeps. */
function Address() {
  const { search } = useLocation();
  return <output aria-label="Address">{search}</output>;
}

const renderPage = (url = '/activities') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[url]}>
      <SectionPage section={activities} />
      <Address />
    </MemoryRouter>,
  );

/** Every piece of an activity on the calendar: each week of its bar, its deadline and results dots. */
const pieces = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-calendar-entry="${id}"]`)];

const address = () => new URLSearchParams(screen.getByLabelText('Address').textContent ?? '');
const calendar = () => screen.findByRole('region', { name: 'Calendar' }, { timeout: 5000 });

beforeEach(() => {
  // Only the date is faked, so the calendar's "this month" is fixed while user-event's timers still run.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00'));
});
afterEach(() => vi.useRealTimers());

describe('activities calendar', () => {
  it('switches from the list to this month, and keeps the choice in the address', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('AWS Summit');
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    const cal = await calendar();
    expect(within(cal).getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(within(cal).getByText('AWS Summit')).toBeInTheDocument();
    expect(within(cal).queryByText('Film Meetup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'true');
    expect(address().get('view')).toBe('calendar');
    // One with no dates can't be placed, but isn't lost.
    expect(within(screen.getByRole('group', { name: 'Not on the calendar' })).getByRole('button', { name: 'Reef talk' })).toBeInTheDocument();
    // Sorting means nothing on a calendar.
    expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
  });

  it('goes from month to month, and back to today', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await user.click(within(cal).getByRole('button', { name: 'Next month' }));
    expect(within(cal).getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(await within(cal).findByText('Film Meetup')).toBeInTheDocument();
    expect(within(cal).queryByText('AWS Summit')).not.toBeInTheDocument();
    expect(address().get('month')).toBe('2026-11');
    await user.click(within(cal).getByRole('button', { name: 'Today' }));
    expect(within(cal).getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(address().has('month')).toBe(false);
  });

  it('opens the month in the address', async () => {
    mockActivities();
    renderPage('/activities?view=calendar&month=2026-11');
    const cal = await calendar();
    expect(within(cal).getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(await within(cal).findByText('Film Meetup')).toBeInTheDocument();
  });

  it('shows only what the search and filters let through, and stays a calendar as they change', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar&month=2026-11');
    const cal = await calendar();
    await within(cal).findByText('Film Meetup');
    await user.type(screen.getAllByRole('searchbox', { name: 'Search activities' })[0], 'AWS');
    await waitFor(() => expect(within(cal).queryByText('Film Meetup')).not.toBeInTheDocument());
    expect(address().get('view')).toBe('calendar');
    expect(address().get('month')).toBe('2026-11');
    expect(address().get('q')).toBe('AWS');
  });

  it("opens an activity's popup on a double click, as its card does on a click, leaving its highlight as it was", async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await user.dblClick(await within(cal).findByText('AWS Summit'));
    expect(await screen.findByRole('dialog', { name: 'Activity' })).toHaveTextContent('AWS Summit');
    expect(pieces('a1')[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it("adds an activity starting on the day whose number is clicked", async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await user.click(within(cal).getByRole('link', { name: 'Add an activity on October 21, 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'New activity' });
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('2026-10-21');
  });

  it('leaves alone the new activity + Add kept in this browser', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await user.click(screen.getAllByRole('button', { name: '+ Add' })[0]);
    await user.type(within(screen.getByRole('dialog', { name: 'New activity' })).getByLabelText(/^Name/), 'Hackathon');
    await user.click(within(screen.getByRole('dialog', { name: 'New activity' })).getByRole('button', { name: 'Back' }));

    await user.click(within(cal).getByRole('link', { name: 'Add an activity on October 21, 2026' }));
    let dialog = screen.getByRole('dialog', { name: 'New activity' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('');
    // Untouched, it closes without asking.
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog', { name: 'New activity' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '+ Add' })[0]);
    dialog = screen.getByRole('dialog', { name: 'New activity' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Hackathon');
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('');
  });

  it('shows the list while selecting, then the calendar again', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    await calendar();
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('region', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select AWS Summit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await calendar()).toBeInTheDocument();
  });

  it('lights up every piece of the activity under the mouse', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    await calendar();
    await waitFor(() => expect(pieces('a4')).toHaveLength(3));
    // Its bar's two weeks and its deadline dot, filled differently (calendar.css).
    expect(pieces('a4').map((p) => p.getAttribute('data-calendar-kind')).sort()).toEqual(['bar', 'bar', 'dot']);
    await user.hover(pieces('a4')[1]);
    for (const piece of pieces('a4')) expect(piece).toHaveAttribute('data-hovered');
    expect(pieces('a1')[0]).not.toHaveAttribute('data-hovered');
    await user.unhover(pieces('a4')[1]);
    for (const piece of pieces('a4')) expect(piece).not.toHaveAttribute('data-hovered');
  });

  it('keeps an activity highlighted after a click, from month to month, until clicked again', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await waitFor(() => expect(pieces('a4')).toHaveLength(3));
    await user.click(pieces('a4')[0]);
    for (const piece of pieces('a4')) expect(piece).toHaveAttribute('aria-pressed', 'true');
    expect(pieces('a1')[0]).toHaveAttribute('aria-pressed', 'false');
    // A click highlights; it doesn't open.
    expect(screen.queryByRole('dialog', { name: 'Activity' })).not.toBeInTheDocument();

    await user.click(within(cal).getByRole('button', { name: 'Next month' }));
    await user.click(within(cal).getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(pieces('a4')).toHaveLength(3));
    for (const piece of pieces('a4')) expect(piece).toHaveAttribute('aria-pressed', 'true');

    await user.click(pieces('a4')[2]);
    for (const piece of pieces('a4')) expect(piece).toHaveAttribute('aria-pressed', 'false');
  });

  it('clears every highlight at once', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await waitFor(() => expect(pieces('a4')).toHaveLength(3));
    expect(within(cal).queryByRole('button', { name: 'Clear highlights' })).not.toBeInTheDocument();
    await user.click(pieces('a4')[0]);
    await user.click(pieces('a1')[0]);
    await user.click(within(cal).getByRole('button', { name: 'Clear highlights' }));
    for (const piece of [...pieces('a4'), ...pieces('a1')]) expect(piece).toHaveAttribute('aria-pressed', 'false');
    expect(within(cal).queryByRole('button', { name: 'Clear highlights' })).not.toBeInTheDocument();
  });

  it('keeps an activity highlighted with Space, and opens it with Enter', async () => {
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    await calendar();
    await waitFor(() => expect(pieces('a1')).toHaveLength(1));
    pieces('a1')[0].focus();
    await user.keyboard(' ');
    expect(pieces('a1')[0]).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Activity' })).toHaveTextContent('AWS Summit');
  });

  it('opens an activity with a tap on a touch screen, which has no hover', async () => {
    // Wide enough for the grid, but no pointer that hovers.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('hover'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    mockActivities();
    const user = userEvent.setup();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    await user.click(await within(cal).findByText('AWS Summit'));
    expect(await screen.findByRole('dialog', { name: 'Activity' })).toHaveTextContent('AWS Summit');
    expect(pieces('a1')[0]).not.toHaveAttribute('aria-pressed');
  });

  it('lists the month by day on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    mockActivities();
    renderPage('/activities?view=calendar');
    const cal = await calendar();
    // Listed under each of its three days, each day a heading that adds an activity on it.
    expect(await within(cal).findAllByText('AWS Summit')).toHaveLength(3);
    expect(cal.querySelector('[data-date="2026-10-21"]')).toBeNull();
    expect(within(cal).getAllByRole('link', { name: /^Add an activity on October [567], 2026$/ })).toHaveLength(3);
  });
});
