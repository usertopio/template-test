// Card thumbnails with the All / PNG / PDF / MP4… switch.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '@profile/shared';
import { MediaStrip, MediaViewer } from '../../src/components/Media';
import { setLanguage } from '../../src/language';
import { mockApi, renderWithQuery } from '../helpers';

const item = (id: string, title: string, mimeType: string) => ({ id, title, mimeType, fileName: `${title}.x`, entryId: 'p1', position: '0', createdAt: '' }) as MediaItem;
const items = [item('1', 'Poster', 'image/png'), item('2', 'Trailer', 'video/mp4'), item('3', 'Behind the scenes', 'video/webm'), item('4', 'Script', 'application/pdf')];

beforeEach(() => {
  mockApi({ '/api/media/2/stream-url': { url: '/api/media/2/stream?exp=1&sig=s' }, '/api/media/3/stream-url': { url: '/api/media/3/stream?exp=1&sig=s' } });
});

const shown = () => screen.getAllByRole('button').filter((b) => b.title).map((b) => b.title);

describe('file types', () => {
  it("marks each thumbnail with its format, and lists each file's format and size", () => {
    renderWithQuery(<MediaStrip items={[{ ...items[0], size: '2048' }, { ...items[3], size: String(3.5 * 1024 * 1024) }, item('5', 'Agenda', 'text/plain')]} />);
    expect(screen.getAllByTitle('File type').map((b) => b.textContent)).toEqual(['PNG', 'PDF', 'TXT']);
    expect(screen.getByRole('button', { name: 'Poster' })).toHaveTextContent('PNG · 2 KB');
    expect(screen.getByRole('button', { name: 'Script' })).toHaveTextContent('PDF · 3.5 MB');
    expect(within(screen.getByRole('group', { name: 'Show media' })).getByRole('button', { name: 'TXT 1' })).toBeInTheDocument();
  });

  it('opens a text file as its text', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url === 'blob:preview' ? new Response('กำหนดการ\n09:00 Welcome') : new Response('x')));
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={[item('5', 'Agenda', 'text/plain')]} />);
    await user.click(screen.getByRole('button', { name: 'Agenda' }));
    const text = await within(screen.getByRole('dialog', { name: 'Agenda' })).findByLabelText('Agenda');
    expect(text.tagName).toBe('PRE');
    expect(text.textContent).toBe('กำหนดการ\n09:00 Welcome');
  });
});

describe('MediaStrip', () => {
  it('filters thumbnails by one or several file formats', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(shown()).toEqual(['Poster', 'Trailer', 'Behind the scenes', 'Script']);

    // Formats in upload-list order, each with its count.
    expect(within(screen.getByRole('group', { name: 'Show media' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All 4', 'PNG 1', 'PDF 1', 'MP4 1', 'WEBM 1']);
    await user.click(screen.getByRole('button', { name: 'WEBM 1' }));
    expect(shown()).toEqual(['Behind the scenes']);
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'false');
    // Several formats at once; clicking one again drops it.
    await user.click(screen.getByRole('button', { name: 'PDF 1' }));
    expect(shown()).toEqual(['Behind the scenes', 'Script']);
    await user.click(screen.getByRole('button', { name: 'WEBM 1' }));
    expect(shown()).toEqual(['Script']);
    await user.click(screen.getByRole('button', { name: 'All 4' }));
    expect(shown()).toHaveLength(4);
    // Picking every format is the same as All.
    for (const name of ['PNG 1', 'PDF 1', 'MP4 1', 'WEBM 1']) await user.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows videos with their first frame from the signed stream link', async () => {
    renderWithQuery(<MediaStrip items={[items[1]]} />);
    const video = await screen.findByLabelText('Trailer', { selector: 'video' });
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', '/api/media/2/stream?exp=1&sig=s#t=0.1');
    // One format still gets the switch: All and that format.
    expect(within(screen.getByRole('group', { name: 'Show media' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All 1', 'MP4 1']);
  });
});

describe('descriptions on the card', () => {
  afterEach(() => setLanguage('en'));
  const described = [{ ...items[0], description: 'The poster\nfor the premiere', description_th: 'โปสเตอร์' }, items[3]] as MediaItem[];

  it('shows each file with its title and its whole description, however long', () => {
    renderWithQuery(<MediaStrip items={described} />);
    const poster = screen.getByRole('button', { name: 'Poster' });
    expect(poster).toHaveAccessibleDescription(/^The poster\s+for the premiere$/);
    expect(within(poster).getByText(/The poster/).className).not.toMatch(/line-clamp|truncate/);
    // A file without a description shows just its title.
    expect(screen.getByRole('button', { name: 'Script' })).not.toHaveAttribute('aria-describedby');
  });

  it('shows the Thai description when the profile is in Thai', () => {
    setLanguage('th');
    renderWithQuery(<MediaStrip items={described} />);
    expect(screen.getByRole('button', { name: 'Poster' })).toHaveAccessibleDescription('โปสเตอร์');
  });
});

describe('MediaViewer', () => {
  afterEach(() => setLanguage('en'));
  const poster = (description_th: string) => ({ ...items[0], description: 'The poster', description_th }) as MediaItem;

  it('shows the description in the language the profile is shown in', () => {
    setLanguage('th');
    renderWithQuery(<MediaViewer item={poster('โปสเตอร์')} />);
    expect(screen.getByText('โปสเตอร์')).toBeInTheDocument();
    expect(screen.queryByText('The poster')).not.toBeInTheDocument();
  });

  it('falls back to the English description when there is no Thai one', () => {
    setLanguage('th');
    renderWithQuery(<MediaViewer item={poster('')} />);
    expect(screen.getByText('The poster')).toBeInTheDocument();
  });

  it('shows English in English', () => {
    renderWithQuery(<MediaViewer item={poster('โปสเตอร์')} />);
    expect(screen.getByText('The poster')).toBeInTheDocument();
  });
});

describe('downloading selected files', () => {
  it('ticks thumbnails instead of opening them, and fetches only the ticked files', async () => {
    const fetch = mockApi({});
    fetch.mockImplementation(async () => new Response(new Blob(['x'])));
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} zipName="Film" />);

    await user.click(screen.getByRole('button', { name: 'Select files' }));
    expect(screen.getByRole('toolbar', { name: 'Selected media' })).toHaveTextContent('Tick files to download or delete');
    expect(screen.getByRole('button', { name: 'Download 0 selected' })).toBeDisabled();
    await user.click(screen.getByTitle('Poster'));
    await user.click(screen.getByTitle('Script'));
    await user.click(screen.getByTitle('Script')); // untick
    await user.click(screen.getByTitle('Behind the scenes'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // ticking doesn't open files
    expect(screen.getByTitle('Poster')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('toolbar', { name: 'Selected media' })).toHaveTextContent('2 selected');

    fetch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Download 2 selected' }));
    // Back to normal once it's done, having fetched only Poster (the file) and the video's stream link.
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
    const urls = fetch.mock.calls.map(([url]) => String(url)).filter((u) => u.startsWith('/api/'));
    expect(urls).toEqual(expect.arrayContaining(['/api/media/1/file', '/api/media/3/stream-url']));
    expect(urls.some((u) => u.includes('/media/4/') || u.includes('/media/2/'))).toBe(false);
  });

  it('selects all the files the switch shows', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    await user.click(screen.getByRole('button', { name: 'PDF 1' }));
    await user.click(screen.getByRole('button', { name: 'Select files' }));
    await user.click(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByRole('toolbar', { name: 'Selected media' })).toHaveTextContent('1 selected');
  });
});

describe('deleting selected files', () => {
  const deletes = (fetch: ReturnType<typeof mockApi>) => fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);

  it('deletes the ticked files after one confirmation', async () => {
    const fetch = mockApi({ 'DELETE /api/media/1': null, 'DELETE /api/media/4': null });
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    await user.click(screen.getByRole('button', { name: 'Select files' }));
    expect(screen.getByRole('button', { name: 'Delete 0 selected' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Select Poster' }));
    await user.click(screen.getByRole('button', { name: 'Select Script' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 selected' }));

    const confirm = screen.getByRole('dialog', { name: 'Delete 2 files?' });
    expect(deletes(fetch)).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Selected media' })).not.toBeInTheDocument());
    expect(deletes(fetch)).toEqual(['/api/media/1', '/api/media/4']);
  });

  it('keeps the files that failed ticked, with the reason', async () => {
    const fetch = mockApi({ 'DELETE /api/media/1': null });
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    await user.click(screen.getByRole('button', { name: 'Select files' }));
    await user.click(screen.getByRole('button', { name: 'Select Poster' }));
    await user.click(screen.getByRole('button', { name: 'Select Script' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 selected' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete 2 files?' })).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText("Couldn't delete 1 file: No mock for DELETE /api/media/4")).toBeInTheDocument();
    expect(deletes(fetch)).toEqual(['/api/media/1', '/api/media/4']);
    expect(screen.getByRole('button', { name: 'Select Script' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select Poster' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers Select files for a single file too, so it can be deleted from the card', () => {
    renderWithQuery(<MediaStrip items={[items[0]]} />);
    expect(screen.getByRole('button', { name: 'Select files' })).toBeInTheDocument();
  });
});

describe('deleting the file that is open', () => {
  it('deletes it from its viewer after a confirmation, and closes the viewer', async () => {
    const fetch = mockApi({ 'DELETE /api/media/1': null });
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    await user.click(screen.getByTitle('Poster'));
    const viewer = screen.getByRole('dialog', { name: 'Poster' });
    await user.click(within(viewer).getByRole('button', { name: 'Delete Poster.x' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this file?' });
    expect(confirm).toHaveTextContent('Poster will be removed from this entry');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Poster' })).not.toBeInTheDocument());
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url)).toEqual(['/api/media/1']);
  });

  it('says why a delete failed and keeps the file open', async () => {
    mockApi({});
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={items} />);
    await user.click(screen.getByTitle('Poster'));
    await user.click(within(screen.getByRole('dialog', { name: 'Poster' })).getByRole('button', { name: 'Delete Poster.x' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete this file?' })).getByRole('button', { name: 'Delete' }));
    expect(await within(screen.getByRole('dialog', { name: 'Poster' })).findByText("Couldn't delete: No mock for DELETE /api/media/1")).toBeInTheDocument();
  });
});

describe('Drive thumbnails', () => {
  it("shows Drive's small preview instead of loading the file, e.g. a PDF's first page", async () => {
    const fetch = mockApi({});
    fetch.mockImplementation(async (url: string) => (url === '/api/media/4/thumb?size=200' ? new Response(new Blob(['jpeg'])) : Response.json({ error: 'nope' }, { status: 404 })));
    renderWithQuery(<MediaStrip items={[items[3]]} />);
    const img = await screen.findByRole('img', { name: 'Script' });
    expect(img).toHaveAttribute('src', 'blob:preview');
    expect(img.parentElement).toHaveTextContent('PDF'); // the badge on the thumbnail
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/media/4/thumb?size=200']); // not the file itself
  });
});
