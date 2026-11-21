// Auto-save: an existing entry saves itself a moment after each change; a new one is kept in this browser.
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import { ApiError } from '../../src/api';
import EntryForm, { AUTOSAVE_MS } from '../../src/components/EntryForm';
import { mockApi, renderWithQuery } from '../helpers';

const projects = getSection('projects')!;
const film = { id: 'p1', name: 'Film', createdAt: '', updatedAt: '' };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  mockApi({ '/api/sections/organizations': [{ id: 'o1', name: 'Studio X' }], '/api/sections/skills': [], '/api/sections/projects': [], '/api/sections/posts': [], '/api/sections/certifications': [], '/api/sections/certificates': [], '/api/media': [], '/api/health': { ok: true, media: { ok: true } } });
});
afterEach(() => {
  vi.useRealTimers();
});

const pause = () => act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function renderExisting(autoSave = vi.fn(async (_data: Record<string, string>) => {})) {
  const view = renderWithQuery(<EntryForm section={projects} initial={film} onSubmit={vi.fn()} autoSave={autoSave} />);
  return { autoSave, ...view };
}

describe('existing entries', () => {
  it('save a moment after the last change, without pressing Save', async () => {
    const user = setup();
    const { autoSave } = renderExisting();
    expect(screen.getByText('Changes save automatically')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Role/ }), 'Editor');
    expect(autoSave).not.toHaveBeenCalled();
    expect(screen.getByText('Saving in a moment…')).toBeInTheDocument();

    await pause();
    expect(autoSave).toHaveBeenCalledTimes(1);
    expect(autoSave.mock.calls[0][0]).toMatchObject({ name: 'Film', role: 'Editor' });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    // Nothing new: no second save.
    await pause();
    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it("wait until the focus leaves an organization, so a half-typed name isn't registered", async () => {
    const user = setup();
    const { autoSave } = renderExisting();
    await user.type(screen.getByRole('combobox', { name: /^Organization/ }), 'Stu');
    await pause();
    expect(autoSave).not.toHaveBeenCalled();

    await user.type(screen.getByRole('combobox', { name: /^Organization/ }), 'dio Y');
    await user.click(screen.getByRole('textbox', { name: /Role/ }));
    await pause();
    expect(autoSave).toHaveBeenCalledTimes(1);
    expect(autoSave.mock.calls[0][0]).toMatchObject({ organization: 'Studio Y' });
  });

  it('show a refused change under its field without taking the focus, and not retry it', async () => {
    const user = setup();
    const autoSave = vi.fn(async () => {
      throw new ApiError('Validation failed', 400, { url: 'Must be a valid URL, e.g. https://example.com' });
    });
    renderExisting(autoSave);
    const role = screen.getByRole('textbox', { name: /Role/ });
    await user.type(role, 'Editor');
    await pause();
    expect(await screen.findByText('Must be a valid URL, e.g. https://example.com')).toBeInTheDocument();
    expect(screen.getByText(/^Not saved: Project URL/)).toBeInTheDocument();
    expect(role).toHaveFocus();
    await pause();
    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it('save the last change when the form closes during the pause', async () => {
    const user = setup();
    const { autoSave, unmount } = renderExisting();
    await user.type(screen.getByRole('textbox', { name: /Role/ }), 'Editor');
    unmount();
    expect(autoSave).toHaveBeenCalledWith(expect.objectContaining({ role: 'Editor' }));
  });
});

describe('new entries', () => {
  const renderNew = (onSubmit = vi.fn(async () => {})) => ({ onSubmit, ...renderWithQuery(<EntryForm section={projects} onSubmit={onSubmit} backupKey="projects" />) });

  it('are kept in this browser and brought back next time, until saved', async () => {
    const user = setup();
    const first = renderNew();
    expect(screen.getByText('Kept in this browser until you save')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Reef tank');
    first.unmount();

    const { onSubmit } = renderNew();
    expect(screen.getByRole('textbox', { name: /Project name/ })).toHaveValue('Reef tank');
    expect(screen.getByText('Brought back what you typed last time.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Reef tank' }), []);
    expect(localStorage.getItem('newEntry:projects')).toBeNull();
  });

  it('start over from an empty form', async () => {
    const user = setup();
    renderNew().unmount();
    localStorage.setItem('newEntry:projects', JSON.stringify({ name: 'Old idea' }));
    renderNew();
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('textbox', { name: /Project name/ })).toHaveValue('');
    expect(screen.queryByText('Brought back what you typed last time.')).not.toBeInTheDocument();
    expect(localStorage.getItem('newEntry:projects')).toBeNull();
  });
});
