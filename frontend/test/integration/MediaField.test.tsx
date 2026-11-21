// Adding media to an entry: the file picker, the title/description dialog, and when files are uploaded.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import EntryForm from '../../src/components/EntryForm';
import type { PendingMedia } from '../../src/components/MediaField';
import { setLanguage } from '../../src/language';
import { mockApi, renderWithQuery } from '../helpers';

// jsdom can't draw on a canvas: each format stands in as a file of that type (credentialFiles.test.ts covers the PDF).
vi.mock('../../src/credentialFiles', () => ({
  credentialFormats: vi.fn(async (file: File) =>
    (['png', 'jpg', 'pdf'] as const).map((ext) => new File(['x'], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' }[ext] })),
  ),
}));

const projects = getSection('projects')!;
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'aws-certificate.png', { type: 'image/png' });

const stored = {
  id: 'm1',
  section: 'projects',
  entryId: 'p1',
  title: 'Poster',
  description: '',
  position: '0',
  fileName: 'Project_Poster_Tammasorn.pdf',
  mimeType: 'application/pdf',
  size: '10',
  createdAt: '2026-01-01T00:00:00Z',
};

let fetch: ReturnType<typeof mockApi>;

beforeEach(() => {
  fetch = mockApi({
    '/api/sections/organizations': [],
    '/api/sections/skills': [],
    '/api/sections/projects': [],
    '/api/sections/certifications': [],
    '/api/media': [stored],
    '/api/health': { ok: true, media: { ok: true } },
    'POST /api/media': { ...stored, id: 'm2', title: 'AWS' },
    'PUT /api/media/m1': { ...stored, title: 'Final poster' },
    'PUT /api/media/order': [],
  });
});

function renderForm(initial?: Record<string, string>, options?: Parameters<typeof userEvent.setup>[0]) {
  const onSubmit = vi.fn(async (_data: Record<string, string>, _media: PendingMedia[]) => {});
  renderWithQuery(<EntryForm section={projects} initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup(options) };
}

const dialog = () => screen.getByRole('dialog', { name: /media/ });
const requests = (method: string) => fetch.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

afterEach(() => setLanguage('en'));

describe('file sizes', () => {
  const sized = (name: string, type: string, bytes: number) => Object.defineProperty(new File([''], name, { type }), 'size', { value: bytes });

  it("shows each file's size: stored ones, picked ones, and in the dialogs", async () => {
    mockApi({
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/projects': [],
      '/api/sections/certifications': [],
      '/api/media': [{ ...stored, size: String(2.5 * 1024 * 1024) }],
      '/api/health': { ok: true, media: { ok: true } },
    });
    const { user } = renderForm({ id: 'p1', name: 'Old' });
    expect(await screen.findByText('2.5 MB')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Choose media files'), sized('poster.png', 'image/png', 300 * 1024));
    expect(within(dialog()).getByText('poster.png · 300 KB')).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    await user.upload(screen.getByLabelText('Choose media files'), [sized('a.png', 'image/png', 1024 * 1024), sized('b.png', 'image/png', 2048)]);
    const list = screen.getByRole('dialog', { name: 'Add 2 files' });
    expect(within(list).getByText('1 MB')).toBeInTheDocument();
    expect(within(list).getByText('2 KB')).toBeInTheDocument();
  });

  it("shows no size for a stored file that has none recorded, rather than 1 KB", async () => {
    mockApi({
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/projects': [],
      '/api/sections/certifications': [],
      '/api/media': [{ ...stored, size: '' }],
      '/api/health': { ok: true, media: { ok: true } },
    });
    renderForm({ id: 'p1', name: 'Old' });
    expect(await screen.findByText('Poster')).toBeInTheDocument();
    expect(screen.queryByText('1 KB')).not.toBeInTheDocument();
  });
});

describe('media on a new entry', () => {
  it('asks for a title (defaulting to the file name) and uploads after the entry is saved', async () => {
    const { user, onSubmit } = renderForm();
    await user.upload(screen.getByLabelText('Choose media files'), png());

    const title = within(dialog()).getByRole('textbox', { name: /Title/ });
    expect(title).toHaveValue('aws-certificate');
    await user.clear(title);
    await user.type(title, 'AWS Certificate');
    await user.type(within(dialog()).getByRole('textbox', { name: /^Description/ }), 'Passed');
    // One description box, switched to Thai like the entry form; the English stays in view to translate from.
    await user.click(within(dialog()).getByRole('button', { name: 'ไทย' }));
    expect(within(dialog()).getAllByRole('textbox', { name: /^Description/ })).toHaveLength(1);
    expect(within(dialog()).getByText('English', { selector: 'summary' })).toBeInTheDocument();
    expect(within(dialog()).getByText('Passed')).toBeInTheDocument();
    await user.type(within(dialog()).getByRole('textbox', { name: /^Description/ }), 'สอบผ่าน');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('AWS Certificate')).toBeInTheDocument();
    expect(screen.getByText('Uploads when saved')).toBeInTheDocument();
    expect(requests('POST')).toHaveLength(0);

    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Film' }), [
      expect.objectContaining({ title: 'AWS Certificate', description: 'Passed', description_th: 'สอบผ่าน', file: expect.any(File) }),
    ]);
  });

  it('opens on the Thai description when the profile is shown in Thai', async () => {
    setLanguage('th');
    const { user } = renderForm();
    await user.upload(screen.getByLabelText('Choose media files'), png());
    expect(within(dialog()).getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog()).getByRole('textbox', { name: /^Description/ })).toHaveAttribute('lang', 'th');
  });

  it('requires a title', async () => {
    const { user } = renderForm();
    await user.upload(screen.getByLabelText('Choose media files'), png());
    await user.clear(within(dialog()).getByRole('textbox', { name: /Title/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(within(dialog()).getByText('Title is required')).toBeInTheDocument();
  });

  it('rejects other file types before uploading', async () => {
    const { user } = renderForm(undefined, { applyAccept: false });
    await user.upload(screen.getByLabelText('Choose media files'), new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));
    expect(screen.getByText('a.gif: Only JPG, PNG, PDF, MP4, MOV or WebM files')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('media on a saved entry', () => {
  it('shows existing media and uploads new files straight away', async () => {
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    expect(await screen.findByText('Poster')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Choose media files'), png());
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('POST')).toHaveLength(1));
    const body = requests('POST')[0][1]!.body as FormData;
    expect(Object.fromEntries([...body.entries()].filter(([k]) => k !== 'file'))).toEqual({
      section: 'projects',
      entryId: 'p1',
      title: 'aws-certificate',
      description: '',
      description_th: '',
    });
    expect(body.get('file')).toBeInstanceOf(File);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a spinner on Save while the file uploads, not "Uploading 0%"', async () => {
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? new Promise<Response>(() => {}) : base(url, init)));
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), png());
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    const busy = await within(dialog()).findByRole('button', { name: 'Uploading' });
    expect(busy).toBeDisabled();
    expect(busy.querySelector('svg.animate-spin')).not.toBeNull();
    expect(busy).toHaveTextContent(/^$/);
  });

  it('edits the title and descriptions of stored media', async () => {
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.click(await screen.findByRole('button', { name: /^(?!Remove).*Poster/ }));
    const title = within(dialog()).getByRole('textbox', { name: /Title/ });
    await user.clear(title);
    await user.type(title, 'Final poster');
    await user.click(within(dialog()).getByRole('button', { name: 'ไทย' }));
    await user.type(within(dialog()).getByRole('textbox', { name: /^Description/ }), 'โปสเตอร์');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT')).toHaveLength(1));
    expect(JSON.parse(requests('PUT')[0][1]!.body as string)).toEqual({ title: 'Final poster', description: '', description_th: 'โปสเตอร์' });
  });

  it('disables adding media when storage is not set up', async () => {
    mockApi({ '/api/media': [], '/api/sections/organizations': [], '/api/health': { ok: true, media: { ok: false, error: 'DRIVE_FOLDER_URL is not set' } } });
    renderForm({ id: 'p1', name: 'Film' });
    expect((await screen.findAllByText(/DRIVE_FOLDER_URL is not set/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Add media/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add files/ })).toBeDisabled();
  });
});

describe('ordering', () => {
  it('moves stored media with the arrow buttons and saves the order', async () => {
    const second = { ...stored, id: 'm2', title: 'Scan', position: '1' };
    fetch = mockApi({ '/api/media': [stored, second], '/api/sections/organizations': [], '/api/health': { ok: true, media: { ok: true } }, 'PUT /api/media/order': [] });
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    expect(await screen.findByRole('button', { name: 'Move “Poster” earlier' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move “Poster” later' }));
    await waitFor(() => expect(requests('PUT')).toHaveLength(1));
    expect(JSON.parse(requests('PUT')[0][1]!.body as string)).toEqual({ entryId: 'p1', ids: ['m2', 'm1'] });
    // Shown in the new order straight away.
    expect(screen.getAllByRole('button', { name: /^Move “.*” later$/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Move “Scan” later', 'Move “Poster” later']);
  });

  it('drags a stored file onto another to reorder, without opening it', async () => {
    const second = { ...stored, id: 'm2', title: 'Scan', position: '1' };
    fetch = mockApi({ '/api/media': [stored, second], '/api/sections/organizations': [], '/api/health': { ok: true, media: { ok: true } }, 'PUT /api/media/order': [] });
    renderForm({ id: 'p1', name: 'Film' });
    const tile = (title: string) => screen.getByText(title, { selector: 'span' }).closest<HTMLElement>('[data-sort-key]')!;
    await screen.findByRole('button', { name: 'Move “Poster” later' });
    document.elementFromPoint = () => tile('Scan'); // jsdom has no layout: the pointer is "over" Scan

    fireEvent.pointerDown(tile('Poster'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 40, clientY: 0 });
    // Moves while dragging, before anything is saved.
    expect(screen.getAllByRole('button', { name: /^Move “.*” later$/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Move “Scan” later', 'Move “Poster” later']);
    expect(requests('PUT')).toHaveLength(0);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.click(screen.getByText('Poster', { selector: 'span' }));

    await waitFor(() => expect(requests('PUT')).toHaveLength(1));
    expect(JSON.parse(requests('PUT')[0][1]!.body as string)).toEqual({ entryId: 'p1', ids: ['m2', 'm1'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // the drop's click didn't open the editor
  });

  it('lets a file just uploaded be moved at once, before the list has reloaded', async () => {
    const base = fetch.getMockImplementation()!;
    let loads = 0;
    // The first load answers; the reload after the upload never does (still on its way when the file is moved).
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (url === '/api/media' && (init?.method ?? 'GET') === 'GET' && loads++ > 0 ? new Promise<Response>(() => {}) : base(url, init)));
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await screen.findByText('Poster');
    await user.upload(screen.getByLabelText('Choose media files'), png());
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Move “AWS” earlier' }));
    await waitFor(() => expect(requests('PUT')).toHaveLength(1));
    expect(JSON.parse(requests('PUT')[0][1]!.body as string)).toEqual({ entryId: 'p1', ids: ['m2', 'm1'] });
  });

  it('reorders files that are waiting to upload', async () => {
    const { user, onSubmit } = renderForm();
    for (const name of ['first.png', 'second.png']) {
      await user.upload(screen.getByLabelText('Choose media files'), new File([new Uint8Array([0x89])], name, { type: 'image/png' }));
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    }
    await user.click(screen.getByRole('button', { name: 'Move “second” earlier' }));
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => m.title)).toEqual(['second', 'first']);
  });
});

describe('several files at once', () => {
  const files = () => ['one.png', 'two.png', 'three.png'].map((n) => new File([new Uint8Array([0x89])], n, { type: 'image/png' }));
  const many = () => screen.getByRole('dialog', { name: /Add \d files/ });

  it('lists them with titles from their names, and adds them to a new entry in order', async () => {
    const { user, onSubmit } = renderForm(undefined, { applyAccept: false });
    await user.upload(screen.getByLabelText('Choose media files'), [...files(), new File(['GIF89a'], 'bad.gif', { type: 'image/gif' })]);
    expect(screen.getByText('bad.gif: Only JPG, PNG, PDF, MP4, MOV or WebM files')).toBeInTheDocument();
    expect(within(many()).getAllByRole('textbox', { name: /^Title for/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['one', 'two', 'three']);

    await user.click(within(many()).getByRole('button', { name: 'Remove two.png' }));
    await user.type(within(many()).getByRole('textbox', { name: 'Description for three.png' }), 'Back side');
    await user.click(within(many()).getByRole('button', { name: 'ไทย' }));
    expect(within(many()).queryByRole('textbox', { name: 'Description for three.png' })).not.toBeInTheDocument();
    await user.type(within(many()).getByRole('textbox', { name: 'Thai description for three.png' }), 'ด้านหลัง');
    await user.click(within(many()).getByRole('button', { name: 'Add 2 files' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => [m.title, m.description, m.description_th])).toEqual([
      ['one', '', ''],
      ['three', 'Back side', 'ด้านหลัง'],
    ]);
  });

  it('puts them in order with the arrows before they upload, and uploads them in that order', async () => {
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), files());
    expect(within(many()).getByRole('button', { name: 'Move “one” up' })).toBeDisabled();
    await user.click(within(many()).getByRole('button', { name: 'Move “three” up' }));
    await user.click(within(many()).getByRole('button', { name: 'Move “three” up' }));
    expect(within(many()).getAllByRole('textbox', { name: /^Title for/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['three', 'one', 'two']);
    await user.click(within(many()).getByRole('button', { name: 'Upload 3 files' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests('POST').map(([, init]) => (init!.body as FormData).get('title'))).toEqual(['three', 'one', 'two']);
  });

  it('drags one by its handle to another place in the list', async () => {
    const { user, onSubmit } = renderForm();
    await user.upload(screen.getByLabelText('Choose media files'), files());
    const row = (name: string) => within(many()).getByRole('textbox', { name: `Title for ${name}` }).closest<HTMLElement>('[data-sort-key]')!;
    const grip = (name: string) => row(name).querySelector<HTMLElement>('[title="Drag to reorder"]')!;
    document.elementFromPoint = () => row('three.png'); // jsdom has no layout: the pointer is "over" the last row
    fireEvent.pointerDown(grip('one.png'), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 40 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 40 });
    await waitFor(() => expect(within(many()).getAllByRole('textbox', { name: /^Title for/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['two', 'three', 'one']));
    await user.click(within(many()).getByRole('button', { name: 'Add 3 files' }));
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => m.title)).toEqual(['two', 'three', 'one']);
  });

  it('uploads them one by one to a saved entry', async () => {
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), files());
    await user.click(within(many()).getByRole('button', { name: 'Upload 3 files' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const titles = requests('POST').map(([, init]) => (init!.body as FormData).get('title'));
    expect(titles).toEqual(['one', 'two', 'three']);
  });

  it('shows a spinner and which file is uploading', async () => {
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === 'POST' ? new Promise<Response>(() => {}) : base(url, init)));
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), files());
    await user.click(within(many()).getByRole('button', { name: 'Upload 3 files' }));

    const busy = await within(many()).findByRole('button', { name: 'Uploading file 1 of 3' });
    expect(busy.querySelector('svg.animate-spin')).not.toBeNull();
    expect(busy).toHaveTextContent(/^1\/3$/);
  });

  it('keeps only the files that failed, with the reason', async () => {
    let n = 0;
    fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && ++n === 2) return Response.json({ error: 'Validation failed', fields: { file: 'Only JPG, PNG or PDF files' } }, { status: 400 });
      if (init?.method === 'POST') return Response.json(stored);
      return Response.json(url === '/api/health' ? { ok: true, media: { ok: true } } : []);
    });
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), files());
    await user.click(within(many()).getByRole('button', { name: 'Upload 3 files' }));
    await waitFor(() => expect(within(many()).getAllByRole('textbox', { name: /^Title for/ })).toHaveLength(1));
    expect(within(many()).getByRole('textbox', { name: 'Title for two.png' })).toBeInTheDocument();
    expect(within(many()).getByText('Only JPG, PNG or PDF files')).toBeInTheDocument();
  });

  it('requires a title for each file', async () => {
    const { user } = renderForm();
    await user.upload(screen.getByLabelText('Choose media files'), files().slice(0, 2));
    await user.clear(within(many()).getByRole('textbox', { name: 'Title for two.png' }));
    await user.click(within(many()).getByRole('button', { name: 'Add 2 files' }));
    expect(within(many()).getByText('Title is required')).toBeInTheDocument();
  });

  it('accepts files dropped on the media block', async () => {
    renderForm();
    const block = screen.getByText('Media').closest('fieldset')!;
    fireEvent.drop(block, { dataTransfer: { files: files().slice(0, 2), types: ['Files'] } });
    expect(await screen.findByRole('dialog', { name: 'Add 2 files' })).toBeInTheDocument();
  });
});

describe('videos', () => {
  const clip = () => new File([new Uint8Array(10)], 'Trailer.mov', { type: '' }); // some browsers give .mov no type

  it('uploads a video in pieces with its type taken from the name', async () => {
    fetch = mockApi({
      '/api/media': [],
      '/api/sections/organizations': [],
      '/api/health': { ok: true, media: { ok: true } },
      'POST /api/media/uploads': { uploadId: 'u1', chunkSize: 4 },
    });
    let pieces = 0;
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      url === '/api/media/uploads/u1' ? Response.json(++pieces === 3 ? { done: true, item: { ...stored, id: 'v1', mimeType: 'video/quicktime' } } : { done: false }) : base(url, init),
    );
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), clip());
    expect(within(dialog()).getByRole('textbox', { name: /Title/ })).toHaveValue('Trailer');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const start = fetch.mock.calls.find(([url, init]) => url === '/api/media/uploads' && init?.method === 'POST')!;
    expect(JSON.parse(start[1]!.body as string)).toEqual({ section: 'projects', entryId: 'p1', title: 'Trailer', description: '', description_th: '', mimeType: 'video/quicktime', size: 10 });
    const ranges = fetch.mock.calls.filter(([url]) => url === '/api/media/uploads/u1').map(([, init]) => (init!.headers as Record<string, string>)['Content-Range']);
    expect(ranges).toEqual(['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10']);
  });

  it("shows a video's progress beside the spinner once it has started moving", async () => {
    fetch = mockApi({
      '/api/media': [],
      '/api/sections/organizations': [],
      '/api/health': { ok: true, media: { ok: true } },
      'POST /api/media/uploads': { uploadId: 'u1', chunkSize: 4 },
    });
    let pieces = 0;
    const base = fetch.getMockImplementation()!;
    // The first piece arrives; the second never does.
    fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      url === '/api/media/uploads/u1' ? (++pieces === 1 ? Response.json({ done: false }) : new Promise<Response>(() => {})) : base(url, init),
    );
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.upload(screen.getByLabelText('Choose media files'), clip());
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    const busy = await within(dialog()).findByRole('button', { name: 'Uploading 40%' });
    expect(busy.querySelector('svg.animate-spin')).not.toBeNull();
    expect(busy).toHaveTextContent(/^40%$/);
  });

  it('allows videos up to 500 MB, images and PDFs up to 100 MB, and text up to 10 MB', async () => {
    const { user } = renderForm(undefined, { applyAccept: false });
    const sized = (name: string, type: string, mb: number) => Object.defineProperty(new File([''], name, { type }), 'size', { value: mb * 1024 * 1024 });
    await user.upload(screen.getByLabelText('Choose media files'), [sized('big.mp4', 'video/mp4', 501), sized('ok.jpeg', 'image/jpeg', 99), sized('big.png', 'image/png', 101)]);
    expect(screen.getByText('big.mp4: Videos can be at most 500 MB · big.png: Images and PDFs can be at most 100 MB')).toBeInTheDocument();
    expect(within(dialog()).getByRole('textbox', { name: /Title/ })).toHaveValue('ok');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await user.upload(screen.getByLabelText('Choose detail files'), sized('notes.txt', 'text/plain', 11));
    expect(screen.getByText('notes.txt: Text files can be at most 10 MB')).toBeInTheDocument();
  });

  it('sends an image over 10 MB in pieces, like a video', async () => {
    const pieces = mockApi({
      '/api/sections/organizations': [],
      '/api/media': [stored],
      '/api/health': { ok: true, media: { ok: true } },
      'POST /api/media/uploads': { uploadId: 'u1', chunkSize: 8 * 1024 * 1024 },
      'PUT /api/media/uploads/u1': { done: true, item: { ...stored, id: 'm3', title: 'IMG_4717', mimeType: 'image/jpeg' } },
    });
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    const photo = new File([new Uint8Array(12 * 1024 * 1024)], 'IMG_4717.jpeg', { type: 'image/jpeg' });
    await user.upload(await screen.findByLabelText('Choose media files'), photo);
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /media/ })).not.toBeInTheDocument());
    const started = pieces.mock.calls.find(([url, init]) => url === '/api/media/uploads' && init?.method === 'POST')!;
    expect(JSON.parse(started[1]!.body as string)).toMatchObject({ mimeType: 'image/jpeg', size: photo.size });
    expect(pieces.mock.calls.filter(([url]) => url === '/api/media/uploads/u1').map(([, init]) => (init!.headers as Record<string, string>)['Content-Range'])).toEqual(['bytes 0-8388607/12582912']);
    expect(pieces.mock.calls.some(([url, init]) => url === '/api/media' && init?.method === 'POST')).toBe(false);
  });
});

describe('certificate file and other media', () => {
  const certificates = getSection('certificates')!;
  const renderCertificate = () => {
    const onSubmit = vi.fn(async (_data: Record<string, string>, _media: PendingMedia[]) => {});
    renderWithQuery(<EntryForm section={certificates} onSubmit={onSubmit} />);
    return { onSubmit, user: userEvent.setup({ applyAccept: false }) };
  };

  it('has separate blocks, and the certificate block takes only images and PDFs', async () => {
    const { user } = renderCertificate();
    expect(screen.getByLabelText('Choose certificate files')).toHaveAttribute('accept', 'image/jpeg,image/png,application/pdf');
    expect(screen.getByLabelText('Choose media files').getAttribute('accept')).toContain('video/mp4');
    await user.upload(screen.getByLabelText('Choose certificate files'), new File([''], 'clip.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('clip.mp4: Only JPG, PNG or PDF files')).toBeInTheDocument();
  });

  it('keeps each file in its block and passes its role on', async () => {
    const { user, onSubmit } = renderCertificate();
    await user.upload(screen.getByLabelText('Choose certificate files'), new File([new Uint8Array([0x25])], 'scan.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await user.upload(screen.getByLabelText('Choose media files'), png());
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    const [certificateBlock, mediaBlock] = screen.getAllByRole('group').filter((g) => g.tagName === 'FIELDSET' && g.querySelector('legend')?.textContent?.match(/^(Certificate file|Media)/));
    // The certificate in all three formats; other media stay as they are.
    expect(within(certificateBlock).getAllByText('scan')).toHaveLength(3);
    expect(within(mediaBlock).getByText('aws-certificate')).toBeInTheDocument();
    expect(within(mediaBlock).queryByText('scan')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Data Analytics');
    await user.type(screen.getByRole('combobox', { name: /Issued by/ }), 'Google');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => [m.file.name, m.title, m.role])).toEqual([
      ['scan.png', 'scan', 'credential'],
      ['scan.jpg', 'scan', 'credential'],
      ['scan.pdf', 'scan', 'credential'],
      ['aws-certificate.png', 'aws-certificate', 'media'],
    ]);
  });

  it("removes a certificate file waiting to upload with its × button, so it's never uploaded", async () => {
    const { user, onSubmit } = renderCertificate();
    await user.upload(screen.getByLabelText('Choose certificate files'), new File([new Uint8Array([0x25])], 'scan.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await user.click(screen.getAllByRole('button', { name: 'Remove “scan”' })[0]);
    expect(screen.getAllByText('scan')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Opening one edits it (it's added already), and it can be deleted there too.
    await user.click(screen.getAllByText('scan')[0]);
    expect(screen.getByRole('dialog', { name: 'Edit media' })).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete this file?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getAllByText('scan')).toHaveLength(1));

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Data Analytics');
    await user.type(screen.getByRole('combobox', { name: /Issued by/ }), 'Google');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => m.file.name)).toEqual(['scan.pdf']);
    expect(requests('DELETE')).toHaveLength(0);
  });

  it('removes a file from "+ New certificate" on an activity before it is saved', async () => {
    mockApi({
      ...Object.fromEntries(['organizations', 'skills', 'posts', 'certificates', 'certifications', 'projects', 'experience', 'education', 'volunteer', 'activities', 'domains'].map((k) => [`/api/sections/${k}`, []])),
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });
    renderWithQuery(<EntryForm section={getSection('activities')!} initial={{ id: 'a1', name: 'Talk' }} onSubmit={vi.fn()} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByRole('button', { name: '+ New certificate' }));
    const form = screen.getByRole('dialog', { name: 'New certificate' });
    await user.upload(within(form).getByLabelText('Choose certificate files'), new File([new Uint8Array([0x25])], 'scan.pdf', { type: 'application/pdf' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Add media' })).getByRole('button', { name: 'Save' }));
    for (let left = 2; left >= 0; left--) {
      await user.click(within(form).getAllByRole('button', { name: 'Remove “scan”' })[0]);
      expect(within(form).queryAllByText('scan')).toHaveLength(left);
    }
    expect(screen.getByRole('dialog', { name: 'New certificate' })).toBeInTheDocument();
  });

  it('asks before deleting an uploaded file with its × button, then moves it to the Drive trash', async () => {
    mockApi({
      '/api/sections/organizations': [],
      '/api/media': [{ ...stored, entryId: 'c1', section: 'certificates', role: 'credential', title: 'Scan' }],
      'DELETE /api/media/m1': { ok: true },
      '/api/health': { ok: true, media: { ok: true } },
    });
    renderWithQuery(<EntryForm section={certificates} initial={{ id: 'c1', name: 'Data Analytics', issuer: 'Google' }} onSubmit={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Remove “Scan”' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this file?' });
    expect(within(confirm).getByText(/moved to the Drive trash/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([url, init]) => url === '/api/media/m1' && init?.method === 'DELETE')).toBe(true));
  });

  it('uploads a certificate to a saved entry as PNG, JPG and PDF, each with the title given', async () => {
    renderWithQuery(<EntryForm section={certificates} initial={{ id: 'c1', name: 'Data Analytics', issuer: 'Google' }} onSubmit={vi.fn()} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Choose certificate files'), new File([new Uint8Array([0x25])], 'scan.pdf', { type: 'application/pdf' }));
    await user.clear(within(dialog()).getByRole('textbox', { name: /^Title/ }));
    await user.type(within(dialog()).getByRole('textbox', { name: /^Title/ }), 'Certificate');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('POST')).toHaveLength(3));
    expect(requests('POST').map(([, init]) => [((init!.body as FormData).get('file') as File).name, (init!.body as FormData).get('title'), (init!.body as FormData).get('role')])).toEqual([
      ['scan.png', 'Certificate', 'credential'],
      ['scan.jpg', 'Certificate', 'credential'],
      ['scan.pdf', 'Certificate', 'credential'],
    ]);
  });
});

describe('detail files', () => {
  it('keep their own block, take documents and text only, and pass their role on', async () => {
    const detail = { ...stored, id: 'm2', title: 'Agenda', role: 'detail', fileName: 'Project_Agenda_Tammasorn.pdf' };
    mockApi({ '/api/media': [stored, detail], '/api/sections/organizations': [], '/api/health': { ok: true, media: { ok: true } } });
    const { user, onSubmit } = renderForm(undefined, { applyAccept: false });
    expect(screen.getByLabelText('Choose detail files')).toHaveAttribute('accept', 'image/jpeg,image/png,application/pdf,text/plain,.txt');
    await user.upload(screen.getByLabelText('Choose detail files'), new File([''], 'clip.mp4', { type: 'video/mp4' }));
    expect(screen.getByText('clip.mp4: Only JPG, PNG, PDF or TXT files')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Choose detail files'), new File([new Uint8Array([0x25])], 'brochure.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][1].map((m) => [m.title, m.role])).toEqual([['brochure', 'detail']]);
  });

  it('take a .txt file, but the media and certificate blocks refuse one', async () => {
    const { user } = renderForm(undefined, { applyAccept: false });
    expect(screen.getByLabelText('Choose media files').getAttribute('accept')).not.toMatch(/text|txt/);
    await user.upload(screen.getByLabelText('Choose media files'), new File(['hi'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText('notes.txt: Only JPG, PNG, PDF, MP4, MOV or WebM files')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose detail files'), new File(['hi'], 'notes.txt', { type: 'text/plain' }));
    expect(within(dialog()).getByRole('textbox', { name: /Title/ })).toHaveValue('notes');
  });

  it('can be written as a new text file, waiting for a new entry to be saved', async () => {
    const { user, onSubmit } = renderForm();
    // Only the detail files offer it.
    expect(screen.getAllByRole('button', { name: 'New text file' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'New text file' }));
    const writer = screen.getByRole('dialog', { name: 'New text file' });
    await user.click(within(writer).getByRole('button', { name: 'Add' }));
    expect(within(writer).getByText('Title is required')).toBeInTheDocument();
    expect(within(writer).getByText('Write something first')).toBeInTheDocument();

    await user.type(within(writer).getByRole('textbox', { name: /Title/ }), 'Agenda');
    await user.type(within(writer).getByRole('textbox', { name: /Text/ }), '09:00 สวัสดี');
    await user.click(within(writer).getByRole('button', { name: 'Add' }));
    expect(screen.queryByRole('dialog', { name: 'New text file' })).not.toBeInTheDocument();
    expect(screen.getByText('Uploads when saved')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const [added] = onSubmit.mock.calls[0][1];
    expect([added.title, added.role, added.file.name, added.file.type]).toEqual(['Agenda', 'detail', 'Agenda.txt', 'text/plain']);
    expect(await added.file.text()).toBe('09:00 สวัสดี');
  });

  it('uploads a new text file straight away on a saved entry', async () => {
    const { user } = renderForm({ id: 'p1', name: 'Film' });
    await user.click(await screen.findByRole('button', { name: 'New text file' }));
    const writer = screen.getByRole('dialog', { name: 'New text file' });
    await user.type(within(writer).getByRole('textbox', { name: /Title/ }), 'Notes');
    await user.type(within(writer).getByRole('textbox', { name: /Text/ }), 'Bring a laptop');
    await user.click(within(writer).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New text file' })).not.toBeInTheDocument());
    const body = requests('POST').find(([url]) => url === '/api/media')![1]!.body as FormData;
    expect([body.get('title'), body.get('role'), (body.get('file') as File).name]).toEqual(['Notes', 'detail', 'Notes.txt']);
  });

  it("show only in their block on a saved entry, apart from its media", async () => {
    const detail = { ...stored, id: 'm2', title: 'Agenda', role: 'detail', fileName: 'Project_Agenda_Tammasorn.pdf' };
    mockApi({ '/api/media': [stored, detail], '/api/sections/organizations': [], '/api/health': { ok: true, media: { ok: true } } });
    renderForm({ id: 'p1', name: 'Film' });
    const block = (name: RegExp) => screen.getAllByRole('group').find((g) => g.tagName === 'FIELDSET' && name.test(g.querySelector('legend')?.textContent ?? ''))!;
    expect(await within(block(/^Detail files/)).findByText('Agenda')).toBeInTheDocument();
    expect(within(block(/^Detail files/)).queryByText('Poster')).not.toBeInTheDocument();
    expect(within(block(/^Media/)).getByText('Poster')).toBeInTheDocument();
    expect(within(block(/^Media/)).queryByText('Agenda')).not.toBeInTheDocument();
  });
});
