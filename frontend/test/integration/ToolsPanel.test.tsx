// The list page's tools panel: placed in the app shell's slots, opened from the top bar or the page header.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { getSection } from '@profile/shared';
import SectionPage from '../../src/components/SectionPage';
import { ToolsSlots } from '../../src/components/ToolsPanel';
import { mockApi, renderWithQuery } from '../helpers';

function renderInShell(route = '/activities') {
  mockApi({
    '/api/sections/activities': [
      { id: 'a1', name: 'Hack day', domain: 'Engineering', createdAt: '', updatedAt: '' },
      { id: 'a2', name: 'Shoot', domain: 'Film', createdAt: '', updatedAt: '' },
    ],
    '/api/sections/posts': [],
    '/api/media': [],
  });
  const topBar = document.body.appendChild(document.createElement('div'));
  const panel = document.body.appendChild(document.createElement('div'));
  renderWithQuery(
    <MemoryRouter initialEntries={[route]}>
      <ToolsSlots value={{ panel, topBar }}>
        <SectionPage section={getSection('activities')!} />
      </ToolsSlots>
    </MemoryRouter>,
  );
  return { topBar, panel, user: userEvent.setup() };
}

describe('search at the top', () => {
  it('searches from the top of the page too, the same search as in the tools panel', async () => {
    const { panel, user } = renderInShell();
    await screen.findByText('Hack day');
    const tools = within(panel).getByRole('complementary', { name: 'Tools' });
    const top = screen.getAllByRole('searchbox', { name: 'Search activities' }).filter((box) => !tools.contains(box));
    // The header's (wide screens) and the list's (phones), each shown at its size.
    expect(top).toHaveLength(2);
    await user.type(top[0], 'shoot');
    expect(screen.queryByText('Hack day')).not.toBeInTheDocument();
    expect(screen.getByText('Shoot')).toBeInTheDocument();
    expect(within(tools).getByRole('searchbox', { name: 'Search activities' })).toHaveValue('shoot');
    expect(top[1]).toHaveValue('shoot');
  });
});

describe('tools panel', () => {
  it('holds search, filters and the actions, in the slot on the right', async () => {
    const { panel } = renderInShell();
    await screen.findByText('Hack day');
    const tools = within(panel).getByRole('complementary', { name: 'Tools' });
    expect(within(tools).getByRole('searchbox', { name: 'Search activities' })).toBeInTheDocument();
    expect(within(tools).getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    expect(within(tools).getByRole('group', { name: 'Domain' })).toBeInTheDocument();
    expect(within(tools).getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(within(tools).getByRole('button', { name: 'Export all 2 activities' })).toBeInTheDocument();
    // The domain filters by its chips only, not a dropdown as well.
    expect(within(tools).queryByRole('combobox', { name: 'Domain' })).not.toBeInTheDocument();
  });

  it('slides in from the tools button in the top bar, which counts the filters on, and closes again', async () => {
    const { topBar, panel, user } = renderInShell('/activities?domain=film');
    await screen.findByText('Shoot');
    const tools = within(panel).getByRole('complementary', { name: 'Tools' });
    expect(tools.className).toMatch(/\binvisible\b/);
    const open = within(topBar).getByRole('button', { name: 'Tools, 1 filter on' });
    await user.click(open);
    expect(tools.className).toMatch(/\bvisible translate-x-0\b/);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(tools).getByRole('button', { name: 'Close tools' }));
    expect(tools.className).toMatch(/\binvisible\b/);
    // The list says it's narrowed even with the panel closed.
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  it('closes when an action takes over the page', async () => {
    const { topBar, panel, user } = renderInShell();
    await screen.findByText('Hack day');
    await user.click(within(topBar).getByRole('button', { name: 'Tools' }));
    const tools = within(panel).getByRole('complementary', { name: 'Tools' });
    await user.click(within(tools).getByRole('button', { name: 'Select' }));
    expect(tools.className).toMatch(/\binvisible\b/);
    expect(screen.getByRole('toolbar', { name: 'Selected activities' })).toBeInTheDocument();
  });
});
