// List pages: a failed delete or "Mark as posted" says why instead of failing silently.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSection } from '@profile/shared';
import SectionPage from '../../src/components/SectionPage';
import PostsPage from '../../src/pages/PostsPage';
import { setLanguage } from '../../src/language';
import { mockApi, renderWithQuery } from '../helpers';

const inRouter = (ui: React.ReactElement) => renderWithQuery(<MemoryRouter>{ui}</MemoryRouter>);

/** Opens an entry's full card from its summary in the list; returns the preview dialog. */
async function openEntry(user: ReturnType<typeof userEvent.setup>, title: string, dialogName: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
  return screen.getByRole('dialog', { name: dialogName });
}

describe('failed actions', () => {
  it('shows why a delete failed', async () => {
    const fetch = mockApi({ '/api/sections/skills': [{ id: 's1', name: 'React', createdAt: '', updatedAt: '' }], '/api/sections/experience': [], '/api/sections/projects': [], '/api/sections/activities': [] });
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? Response.json({ error: 'Sheets quota exceeded' }, { status: 503 }) : base(url, init),
    );
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    // The first test in this file loads the page's modules as it renders, which takes over the default second on a busy machine.
    await user.click(await screen.findByRole('button', { name: 'Delete' }, { timeout: 5000 }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete this skill?' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete: Sheets quota exceeded");
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('asks in a popup before deleting, and Cancel keeps the entry', async () => {
    const fetch = mockApi({ '/api/sections/skills': [{ id: 's1', name: 'React', createdAt: '', updatedAt: '' }], '/api/sections/experience': [], '/api/sections/projects': [], '/api/sections/activities': [] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this skill?' });
    expect(dialog).toHaveTextContent('React will be removed.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Delete this skill?' })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('shows why "Mark as posted" failed', async () => {
    const fetch = mockApi({ '/api/sections/posts': [{ id: 'p1', title: 'Launch', status: 'draft', createdAt: '', updatedAt: '' }] });
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? Response.json({ error: 'Validation failed', fields: { scheduledDate: 'Use YYYY-MM or YYYY-MM-DD' } }, { status: 400 }) : base(url, init),
    );
    const user = userEvent.setup();
    inRouter(<PostsPage section={getSection('posts')!} />);
    await user.click(await screen.findByRole('button', { name: 'Mark as posted' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't mark as posted: Validation failed"));
  });
});

describe('add and edit dialogs', () => {
  const skills = () =>
    mockApi({
      '/api/sections/skills': [{ id: 's1', name: 'React', createdAt: '', updatedAt: '' }],
      'PUT /api/sections/skills/s1': { id: 's1', name: 'React', endorsementNote: 'Daily', createdAt: '', updatedAt: '' },
      '/api/sections/experience': [],
      '/api/sections/projects': [],
      '/api/sections/activities': [],
    });

  it('has a back arrow when adding, which returns to the list', async () => {
    skills();
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: '+ Add' }));
    const dialog = screen.getByRole('dialog', { name: 'New skill' });
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog', { name: 'New skill' })).not.toBeInTheDocument();
  });

  it('saves an edit by itself, without Save, and closes without asking', async () => {
    const fetch = skills();
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit skill' });
    await user.type(within(dialog).getByRole('textbox', { name: /Notes/ }), 'Daily');
    await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => url === '/api/sections/skills/s1' && init?.method === 'PUT')).toBe(true), { timeout: 3000 });
    const [, init] = fetch.mock.calls.find(([url, init]) => url === '/api/sections/skills/s1' && init?.method === 'PUT')!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ name: 'React', endorsementNote: 'Daily' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit skill' })).not.toBeInTheDocument();
  });

  it('keeps the close button when editing', async () => {
    skills();
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit skill' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('posts filter', () => {
  it('shows the activities no post tells about yet', async () => {
    mockApi({
      '/api/sections/activities': [
        { id: 'a1', name: 'Hack day', createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Meetup', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/posts': [{ id: 'x1', title: 'Recap', activityIds: 'a1', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    await screen.findByText('Hack day');
    await user.click(within(screen.getByRole('group', { name: 'Posts' })).getByRole('button', { name: /^Not in a post yet/ }));
    expect(screen.queryByText('Hack day')).not.toBeInTheDocument();
    expect(screen.getByText('Meetup')).toBeInTheDocument();
  });

  it('scrolls an opened entry to the posts linking it, and leaves one without posts at the top', async () => {
    mockApi({
      '/api/sections/activities': [
        { id: 'a1', name: 'Hack day', createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Meetup', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/posts': [{ id: 'x1', title: 'Recap', activityIds: 'a1', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    // jsdom has no layout, so no scrollIntoView of its own.
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('activities')!} />);
      const dialog = await openEntry(user, 'Hack day', 'Activity');
      const posts = await within(dialog).findByRole('link', { name: 'Posts: Recap' });
      expect(scrolled).toEqual([posts.closest('section')]);
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await openEntry(user, 'Meetup', 'Activity');
      expect(scrolled).toHaveLength(1);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});

describe('quick filters', () => {
  it('shows the entries of every domain picked', async () => {
    mockApi({
      '/api/sections/activities': [
        { id: 'a1', name: 'Hack day', domain: 'Engineering', createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Screening', domain: 'Film', createdAt: '', updatedAt: '' },
        { id: 'a3', name: 'Hike', domain: 'Nature', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/posts': [],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    const domains = await screen.findByRole('group', { name: 'Domain' });
    await user.click(within(domains).getByRole('button', { name: 'Engineering 1' }));
    await user.click(within(domains).getByRole('button', { name: 'Film 1' }));
    expect(screen.getByText('Hack day')).toBeInTheDocument();
    expect(screen.getByText('Screening')).toBeInTheDocument();
    expect(screen.queryByText('Hike')).not.toBeInTheDocument();
    await user.click(within(domains).getByRole('button', { name: 'Engineering 1' }));
    expect(screen.queryByText('Hack day')).not.toBeInTheDocument();
    expect(screen.getByText('Screening')).toBeInTheDocument();
  });
});

describe('no end date', () => {
  it('shows only the start date, and the whole description however long', async () => {
    const long = 'A very long description. '.repeat(40).trim();
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Screening', startDate: '2025-04-01', noEndDate: 'true', description: long, createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    // In the subtitle and on the dates line, with no "– …" after it.
    expect((await screen.findAllByText('01/04/25')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/01\/04\/25 –/)).not.toBeInTheDocument();
    // One date: "Date", not "Dates".
    expect(screen.getByRole('button', { name: /^Screening/ })).toHaveTextContent('Date:01/04/25');
    const dialog = await openEntry(user, 'Screening', 'Project');
    expect(within(dialog).queryByText(/01\/04\/25 –/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(long).className).not.toMatch(/line-clamp/);
  });
});

describe('copy icons', () => {
  // userEvent.setup() gives the page a stand-in clipboard; read what landed there.
  const clipboard = () => navigator.clipboard.readText();
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  it('copies the whole entry from the top-right icon, and single fields from their own icons', async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', role: 'Editor', grade: '', url: 'https://film.test', description: 'Cut it.', createdAt: '', updatedAt: '' }],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    await user.click(await screen.findByRole('button', { name: 'Copy the whole project' }));
    expect(await clipboard()).toBe('Project name: Film\nRole: Editor\nProject URL: https://film.test\nDescription:\nCut it.');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    // Single fields copy from the full card.
    const dialog = await openEntry(user, 'Film', 'Project');
    await user.click(within(dialog).getByRole('button', { name: 'Copy project name' }));
    expect(await clipboard()).toBe('Film');
    await user.click(within(dialog).getByRole('button', { name: 'Copy description' }));
    expect(await clipboard()).toBe('Cut it.');
    // Every other field shows too, with nothing to unfold, each with its own icon.
    expect(within(dialog).queryByText('More (1)')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Copy project url' }));
    expect(await clipboard()).toBe('https://film.test');
  });
  it('copies each organization by itself, in the language shown', async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', organization: 'Studio X; Acme', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    const dialog = await openEntry(user, 'Film', 'Project');
    await user.click(within(dialog).getByRole('button', { name: 'Copy Acme' }));
    expect(await clipboard()).toBe('Acme');
    await user.click(within(dialog).getByRole('button', { name: 'Copy Studio X' }));
    expect(await clipboard()).toBe('Studio X');
    // No icon copying them all together.
    expect(within(dialog).queryByRole('button', { name: 'Copy organization' })).not.toBeInTheDocument();
  });

  it('copies an organization by its Thai name when shown in Thai', async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', organization: 'Studio X; Acme', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    setLanguage('th');
    try {
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('projects')!} />);
      const dialog = await openEntry(user, 'Film', 'Project');
      await user.click(await within(dialog).findByRole('button', { name: 'Copy สตูดิโอเอ็กซ์' }));
      expect(await clipboard()).toBe('สตูดิโอเอ็กซ์');
    } finally {
      setLanguage('en');
    }
  });
});

describe('Locations page', () => {
  it('lists what was at each place on its short card', async () => {
    mockApi({
      '/api/sections/locations': [
        { id: 'l1', name: 'Bangkok', createdAt: '', updatedAt: '' },
        { id: 'l2', name: 'Phuket', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/experience': [{ id: 'x1', title: 'Editor', company: 'X', location: 'bangkok', createdAt: '', updatedAt: '' }],
      '/api/sections/activities': [{ id: 'a1', name: 'AWS Summit', location: 'Bangkok', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('locations')!} />);
    expect(await screen.findByRole('button', { name: /^Bangkok/ })).toHaveTextContent('Used by:Experience: EditorActivity: AWS Summit');
    expect(screen.getByRole('button', { name: /^Phuket/ })).toHaveTextContent('Not used yet');
  });

  it("shows an entry's place with its details on the short card", async () => {
    mockApi({
      '/api/sections/activities': [{ id: 'a1', name: 'AWS Summit', location: 'Bangkok', locationDetail: 'Hall 2', createdAt: '', updatedAt: '' }],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('activities')!} />);
    expect(await screen.findByRole('button', { name: /^AWS Summit/ })).toHaveTextContent('Location:Bangkok · Hall 2');
  });
});

describe('category', () => {
  it('shows as a pill on the short card, without a "Category:" label', async () => {
    mockApi({
      '/api/sections/skills': [{ id: 's1', name: 'React', category: 'Engineering', createdAt: '', updatedAt: '' }],
      '/api/sections/experience': [],
      '/api/sections/projects': [],
      '/api/sections/activities': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('skills')!} />);
    const summary = await screen.findByRole('button', { name: /^React/ });
    expect(within(summary).getByText('Engineering').className).toMatch(/rounded-full/);
    expect(summary).not.toHaveTextContent('Category:');
  });

  it("is a tag with an icon, apart from the domain's pills, on the card and in the popup", async () => {
    mockApi({
      '/api/sections/activities': [{ id: 'a1', name: 'Talk', category: 'Seminar', domain: 'Engineering', createdAt: '', updatedAt: '' }],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    const summary = await screen.findByRole('button', { name: /^Talk/ });
    const tag = within(summary).getByTitle(/^Category/);
    expect(tag).toHaveTextContent(/^Seminar$/);
    expect(tag.querySelector('svg')).not.toBeNull();
    expect(tag.className).not.toBe(within(summary).getByText('Engineering').className);
    const dialog = await openEntry(user, 'Talk', 'Activity');
    expect(within(dialog).getByTitle(/^Category/)).toHaveTextContent(/^Seminar$/);
  });

  it('leads the short card, above the domain', async () => {
    mockApi({
      '/api/sections/activities': [{ id: 'a1', name: 'Talk', category: 'Seminar', domain: 'Engineering', organizer: 'Fibo', createdAt: '', updatedAt: '' }],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('activities')!} />);
    expect(await screen.findByRole('button', { name: /^Talk/ })).toHaveTextContent(/^TalkSeminarDomain:EngineeringOrganizer:Fibo/);
  });
});

describe('Domains page', () => {
  it('shows each subdomain as a pill of its own on the short card', async () => {
    mockApi({
      '/api/sections/domains': [{ id: 'd1', name: 'Engineering', subdomains: 'DevOps, AI & Data', createdAt: '', updatedAt: '' }],
      '/api/sections/projects': [],
      '/api/sections/activities': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('domains')!} />);
    const summary = await screen.findByRole('button', { name: /^Engineering/ });
    expect(within(summary).getByText('DevOps').className).toMatch(/rounded-full/);
    expect(within(summary).getByText('AI & Data').className).toMatch(/rounded-full/);
    expect(summary).not.toHaveTextContent('DevOps, AI & Data');
  });
});

describe('entry cards', () => {
  const project = { id: 'p1', name: 'Film', organization: 'Fibo', role: 'Web dev', startDate: '2026-09-10', createdAt: '', updatedAt: '' };
  const file = (id: string) => ({ id, section: 'projects', entryId: 'p1', title: id, description: '', position: '0', fileName: `${id}.png`, mimeType: 'image/png', size: '4', createdAt: '' });
  const routes = (media: unknown[]) => ({ '/api/sections/projects': [project], '/api/sections/certifications': [], '/api/sections/certificates': [], '/api/sections/posts': [], '/api/media': media });

  describe('a certificate in the popup', () => {
    const certificate = { id: 'c1', name: 'Data Analytics', issuer: 'Google', createdAt: '', updatedAt: '' };
    // Each page uploaded is stored as PNG, JPG and PDF with the same title.
    const page = (title: string, ext: string, mimeType: string) => ({ ...file(`${title}-${ext}`), section: 'certificates', entryId: 'c1', role: 'credential', title, fileName: `${title}.${ext}`, mimeType });
    const formats = (title: string) => [page(title, 'png', 'image/png'), page(title, 'jpg', 'image/jpeg'), page(title, 'pdf', 'application/pdf')];
    const sections = Object.fromEntries(['experience', 'education', 'volunteer', 'activities', 'organizations'].map((k) => [`/api/sections/${k}`, []]));

    it('shows each page of a certificate large in its own popup, as its JPG, and opens it on a click', async () => {
      mockApi({ ...routes([...formats('Front'), ...formats('Back')]), ...sections, '/api/sections/certificates': [certificate], '/api/media/Front-jpg/file': {}, '/api/media/Back-jpg/file': {} });
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('certificates')!} />);
      const dialog = await openEntry(user, 'Data Analytics', 'Certificate');
      expect(await within(dialog).findByRole('img', { name: 'Data Analytics, page 1' })).toBeInTheDocument();
      expect(await within(dialog).findByRole('img', { name: 'Data Analytics, page 2' })).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Data Analytics, page 1' }));
      // Shown as its JPG: smaller than the PNG, and the same picture.
      expect(screen.getByRole('dialog', { name: 'Front' })).toHaveTextContent('Front.jpg');
    });

    it('shows a linked certificate large in the popup of the project that links it', async () => {
      mockApi({ ...routes(formats('Front')), ...sections, '/api/sections/projects': [{ ...project, certificateIds: 'c1' }], '/api/sections/certificates': [certificate], '/api/media/Front-jpg/file': {} });
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('projects')!} />);
      const dialog = await openEntry(user, 'Film', 'Project');
      const box = (await within(dialog).findByText('Certifications & certificates')).closest('section')!;
      expect(await within(box).findByRole('img', { name: 'Data Analytics' })).toBeInTheDocument();
      expect(within(box).getByRole('link', { name: 'Data Analytics' })).toBeInTheDocument();
    });

    it('shows the PDF itself for a certificate stored only as a PDF', async () => {
      mockApi({ ...routes([page('Scan', 'pdf', 'application/pdf')]), ...sections, '/api/sections/certificates': [certificate], '/api/media/Scan-pdf/file': {} });
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('certificates')!} />);
      const dialog = await openEntry(user, 'Data Analytics', 'Certificate');
      expect(await within(dialog).findByTitle('Data Analytics')).toHaveProperty('tagName', 'IFRAME');
    });
  });

  it('shows detail files apart from the media in the popup', async () => {
    mockApi(routes([file('poster'), { ...file('agenda'), role: 'detail', mimeType: 'application/pdf', fileName: 'agenda.pdf' }]));
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    const dialog = await openEntry(user, 'Film', 'Project');
    const strip = (name: string) => within(dialog).getByRole('group', { name: new RegExp(`^${name}`) });
    expect(within(strip('Detail files')).getByText('agenda')).toBeInTheDocument();
    expect(within(strip('Media')).getByText('poster')).toBeInTheDocument();
    expect(within(strip('Media')).queryByText('agenda')).not.toBeInTheDocument();
  });

  it('shows just the essentials in the list, and everything in a popup that can go on to Edit', async () => {
    mockApi({ ...routes([file('a'), file('b')]), '/api/sections/projects': [{ ...project, description: 'Cut the trailer.', url: 'https://film.test' }] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    const summary = await screen.findByRole('button', { name: /^Film/ });
    // The start date shows once, on a labelled line; no end date yet, so no end line.
    expect(summary).toHaveTextContent('FilmOrganization:FiboRole:Web devStart date:10/09/26');
    expect(summary).not.toHaveTextContent('End date');
    expect(await within(summary).findByText('2 files')).toBeInTheDocument();
    expect(screen.queryByText('Cut the trailer.')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    const dialog = await openEntry(user, 'Film', 'Project');
    expect(within(dialog).getByText('Cut the trailer.')).toBeInTheDocument();
    expect(within(dialog).getByText('https://film.test')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Hide media' })).toBeInTheDocument();
    // Its own page is already open, so the footer edits it instead of linking there.
    expect(within(dialog).queryByRole('link', { name: /Open in/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('dialog', { name: 'Project' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
  });

  it('starts the summary with the domain, as the popup does', async () => {
    mockApi({ ...routes([]), '/api/sections/projects': [{ ...project, domain: 'Nature' }] });
    inRouter(<SectionPage section={getSection('projects')!} />);
    const summary = await screen.findByRole('button', { name: /^Film/ });
    expect(summary).toHaveTextContent('FilmDomain:NatureOrganization:FiboRole:Web dev');
    // One line per field, not run together.
    const lines = within(summary).getByText('Domain:').parentElement!.parentElement!;
    expect(lines.className).toMatch(/flex-col/);
    expect([...lines.children].map((line) => line.textContent)).toEqual(['Domain:Nature', 'Organization:Fibo', 'Role:Web dev', 'Start date:10/09/26']);
  });

  it('puts the start and end dates on lines of their own, the end as Present while current', async () => {
    mockApi({ ...routes([]), '/api/sections/projects': [{ ...project, endDate: '2026-09-11' }, { ...project, id: 'p2', name: 'Robot', current: 'true' }] });
    inRouter(<SectionPage section={getSection('projects')!} />);
    const lines = (name: RegExp) => [...within(screen.getByRole('button', { name })).getByText('Role:').parentElement!.parentElement!.children].map((l) => l.textContent);
    expect(await screen.findByRole('button', { name: /^Film/ })).toBeInTheDocument();
    expect(lines(/^Film/).slice(-2)).toEqual(['Start date:10/09/26', 'End date:11/09/26']);
    expect(lines(/^Robot/).slice(-2)).toEqual(['Start date:10/09/26', 'End date:Present']);
  });

  it('lists the fields in form order, each organization on its own line, and each part in its own box', async () => {
    mockApi({ ...routes([]), '/api/sections/projects': [{ ...project, organization: 'Fibo; Acme', domain: 'Nature', endDate: '2026-10-01', url: 'https://film.test', description: 'Cut it.', skills: 'Editing' }] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    const dialog = await openEntry(user, 'Film', 'Project');
    // Domain first, as in the form; start and end dates on rows of their own, where the start date is.
    expect([...dialog.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Domain', 'Organization', 'Role', 'Start date', 'End date', 'Project URL']);
    expect(within(dialog).getByText('10/09/26')).toBeInTheDocument();
    expect(within(dialog).getByText('01/10/26')).toBeInTheDocument();
    expect(within(dialog).queryByText(/–/)).not.toBeInTheDocument();
    const fibo = within(dialog).getByRole('link', { name: 'Fibo' });
    expect(fibo).toHaveAttribute('href', '/organizations?q=Fibo');
    // One list item per organization, top to bottom.
    expect([...fibo.closest('ul')!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Fibo', 'Acme']);
    // Details, Description and Skills each in a box of their own.
    expect([...dialog.querySelectorAll('section')].map((box) => box.querySelector('h4')?.textContent ?? 'details')).toEqual(['details', 'Description', 'Skills']);
  });

  it("shows a download's progress on the card's own button", async () => {
    const fetch = mockApi(routes([file('a'), file('b')]));
    const base = fetch.getMockImplementation()!;
    // Files and thumbnails never finish loading, so the download stays in progress.
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (/\/(file|thumb)/.test(url) ? new Promise<Response>(() => {}) : base(url, init)));
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    await user.click(await screen.findByRole('button', { name: 'Download all 2 files' }));
    expect(await screen.findByRole('button', { name: 'Preparing 0 of 2' })).toBeDisabled();
  });

});

describe('Download and Export in the tools panel', () => {
  const file = (id: string, entryId: string) => ({ id, entryId, section: 'projects', title: id, mimeType: 'image/png', fileName: `${id}.png`, position: '0', createdAt: '' });
  function setUp() {
    const fetch = mockApi({
      '/api/sections/projects': [
        { id: 'p1', name: 'Film', createdAt: '', updatedAt: '' },
        { id: 'p2', name: 'Game', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [file('m1', 'p1'), file('m2', 'p1'), file('m3', 'p2')],
    });
    const base = fetch.getMockImplementation()!;
    // Files never finish loading, so a download stays in progress and shows how many files it took.
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (/\/(file|thumb)/.test(url) ? new Promise<Response>(() => {}) : base(url, init)));
    inRouter(<SectionPage section={getSection('projects')!} />);
    return userEvent.setup();
  }

  it('count every entry when nothing is selected, and act on all of them', async () => {
    const user = setUp();
    const download = await screen.findByRole('button', { name: 'Download the files of all 2 projects' });
    const exportAll = screen.getByRole('button', { name: 'Export all 2 projects' });
    expect(download).toHaveTextContent(/^Download files2$/);
    expect(exportAll).toHaveTextContent(/^Export2$/);

    await user.click(exportAll);
    expect(screen.getByRole('dialog', { name: 'Export' })).toHaveTextContent('2 entries');
    await user.click(within(screen.getByRole('dialog', { name: 'Export' })).getByRole('button', { name: 'Cancel' }));
    await user.click(download);
    // Every file of both projects.
    expect(await screen.findByRole('button', { name: 'Preparing 0 of 3' })).toHaveTextContent('0/3');
  });

  it('cancel a download, offering nothing and showing no error', async () => {
    const user = setUp();
    await user.click(await screen.findByRole('button', { name: 'Download the files of all 2 projects' }));
    await screen.findByRole('button', { name: 'Preparing 0 of 3' });
    await user.click(screen.getByRole('button', { name: 'Cancel download' }));
    expect(screen.queryByRole('button', { name: 'Cancel download' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download the files of all 2 projects' })).toBeEnabled();
    expect(screen.queryByText(/Download failed/)).not.toBeInTheDocument();
  });

  it('count and act on the selected entries once some are ticked', async () => {
    const user = setUp();
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    // Selecting but nothing ticked yet: still all of them.
    expect(screen.getByRole('button', { name: 'Download the files of all 2 projects' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Film' }));

    const download = screen.getByRole('button', { name: 'Download the files of the 1 selected project' });
    const exportSelected = screen.getByRole('button', { name: 'Export the 1 selected project' });
    expect(download).toHaveTextContent(/^Download files1$/);
    expect(exportSelected).toHaveTextContent(/^Export1$/);
    // The selection toolbar no longer repeats them.
    const toolbar = screen.getByRole('toolbar', { name: 'Selected projects' });
    expect(within(toolbar).queryByRole('button', { name: /Download|Export/ })).not.toBeInTheDocument();

    await user.click(exportSelected);
    expect(screen.getByRole('dialog', { name: 'Export' })).toHaveTextContent('1 entry');
    await user.click(within(screen.getByRole('dialog', { name: 'Export' })).getByRole('button', { name: 'Cancel' }));
    await user.click(download);
    // Only Film's two files.
    expect(await screen.findByRole('button', { name: 'Preparing 0 of 2' })).toHaveTextContent('0/2');
  });
});

describe('previews', () => {
  it('previews the organization from its name, then a project linked to it, with Back', async () => {
    const project = { id: 'p1', name: 'Film', organization: 'Fibo', role: 'Web dev', description: 'Cut the trailer.', createdAt: '', updatedAt: '' };
    const fibo = { id: 'o1', name: 'Fibo', type: 'Company', industry: 'Software', createdAt: '', updatedAt: '' };
    // Sections not listed answer with an error, which cards treat as empty.
    mockApi({ '/api/sections/projects': [project], '/api/sections/organizations': [fibo], '/api/sections/certifications': [], '/api/sections/certificates': [], '/api/sections/posts': [], '/api/media': [] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);

    await user.click(within(await openEntry(user, 'Film', 'Project')).getByRole('link', { name: 'Fibo' }));
    const dialog = screen.getByRole('dialog', { name: 'Organization' });
    expect(within(dialog).getByRole('heading', { name: /Fibo/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open in Organizations →' })).toHaveAttribute('href', '/organizations?q=Fibo');

    // The organization lists the projects naming it; one opens on top.
    await user.click(await within(dialog).findByRole('link', { name: 'Projects: Film' }));
    const next = screen.getByRole('dialog', { name: 'Project' });
    expect(within(next).getByText('Cut the trailer.')).toBeInTheDocument();
    await user.click(within(next).getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Organization' })).toBeInTheDocument();
  });
});

describe("editing a linked entry from its preview", () => {
  it("edits an activity's post in a form over the preview, without going to Posts", async () => {
    const activity = { id: 'a1', name: 'AWS Summit', startDate: '2020-05-01', noEndDate: 'true', createdAt: '', updatedAt: '' };
    const post = { id: 'p1', title: 'Launch', status: 'draft', activityIds: 'a1', createdAt: '', updatedAt: '' };
    const fetch = mockApi({
      '/api/sections/activities': [activity],
      '/api/sections/posts': [post],
      'PUT /api/sections/posts/p1': { ...post, notes: 'Thank the hosts' },
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);

    await user.click(await within(await openEntry(user, 'AWS Summit', 'Activity')).findByRole('link', { name: 'Posts: Launch' }));
    const preview = screen.getByRole('dialog', { name: 'Post' });
    // Its page is still a link away, but it can be edited right here.
    expect(within(preview).getByRole('link', { name: 'Open in Posts →' })).toBeInTheDocument();
    await user.click(within(preview).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit post' });
    await user.type(within(form).getByRole('textbox', { name: /^Notes/ }), 'Thank the hosts');
    await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => url === '/api/sections/posts/p1' && init?.method === 'PUT')).toBe(true), { timeout: 3000 });
    const [, init] = fetch.mock.calls.find(([url, init]) => url === '/api/sections/posts/p1' && init?.method === 'PUT')!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ title: 'Launch', notes: 'Thank the hosts', activityIds: 'a1' });

    // Closing the form goes back to the post's preview.
    await user.click(within(form).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Edit post' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Post' })).toBeInTheDocument();
  });
});

describe('total', () => {
  it('shows how many entries the section has in all, drafts too, next to its name', async () => {
    mockApi({
      '/api/sections/volunteer': [
        { id: 'v1', role: 'Guide', organization: 'Zoo', createdAt: '', updatedAt: '' },
        { id: 'v2', role: 'Cook', draft: 'true', createdAt: '', updatedAt: '' },
      ],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('volunteer')!} />);
    expect(await screen.findByRole('heading', { name: /^Volunteer\s*2 entries$/ })).toBeInTheDocument();
  });
});

describe('links', () => {
  it("lists an entry's links in its popup, by title with the site, opening in a new tab", async () => {
    mockApi({
      '/api/sections/volunteer': [{ id: 'v1', role: 'Guide', organization: 'Zoo', links: 'News story | https://www.news.test/zoo\nhttps://photos.test/album', createdAt: '', updatedAt: '' }],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('volunteer')!} />);
    const dialog = await openEntry(user, 'Guide', 'Volunteer role');
    const box = within(dialog).getByRole('heading', { name: 'Links' }).parentElement!;
    const story = within(box).getByRole('link', { name: 'News story' });
    expect(story).toHaveAttribute('href', 'https://www.news.test/zoo');
    expect(story).toHaveAttribute('target', '_blank');
    expect(box).toHaveTextContent('news.test');
    // Without a title, the address itself.
    expect(within(box).getByRole('link', { name: 'https://photos.test/album' })).toBeInTheDocument();
  });
});

describe('clicking a value to filter by it', () => {
  const activities = [
    { id: 'a1', name: 'Talk', category: 'Seminar', domain: 'Engineering', subdomain: 'DevOps', location: 'Bangkok', locationType: 'Hybrid', skills: 'Docker', createdAt: '', updatedAt: '' },
    { id: 'a2', name: 'Course', category: 'Training', domain: 'Engineering', subdomain: 'AI & Data', location: 'Phuket', locationType: 'Online', createdAt: '', updatedAt: '' },
  ];
  const listed = () => screen.getAllByRole('button', { name: /^(Talk|Course)/ }).map((b) => b.textContent!.match(/^(Talk|Course)/)![1]);

  it('in the popup, closes it and shows only the entries with that subdomain', async () => {
    mockApi({ '/api/sections/activities': activities, '/api/sections/posts': [], '/api/media': [] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    const dialog = await openEntry(user, 'Course', 'Activity');
    await user.click(within(dialog).getByRole('button', { name: 'AI & Data' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Activity' })).not.toBeInTheDocument());
    expect(listed()).toEqual(['Course']);
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  it.each([
    ['place', 'Bangkok'],
    ['skill', 'Docker'],
    ['location type', 'Hybrid'],
    ['category', 'Seminar'],
  ])('works for a %s in the popup', async (_, value) => {
    mockApi({ '/api/sections/activities': activities, '/api/sections/posts': [], '/api/media': [] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    const dialog = await openEntry(user, 'Talk', 'Activity');
    await user.click(within(dialog).getByRole('button', { name: new RegExp(value) }));
    await waitFor(() => expect(listed()).toEqual(['Talk']));
  });

  it('on the short card, filters without opening the popup', async () => {
    mockApi({ '/api/sections/activities': activities, '/api/sections/posts': [], '/api/media': [] });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    const summary = await screen.findByRole('button', { name: /^Course/ });
    await user.click(within(summary).getByText('Training'));
    await waitFor(() => expect(listed()).toEqual(['Course']));
    expect(screen.queryByRole('dialog', { name: 'Activity' })).not.toBeInTheDocument();
  });

  it('filters by the English value while the profile is shown in Thai', async () => {
    mockApi({ '/api/sections/activities': [{ ...activities[0], category_th: 'สัมมนา' }, activities[1]], '/api/sections/posts': [], '/api/media': [] });
    setLanguage('th');
    try {
      const user = userEvent.setup();
      inRouter(<SectionPage section={getSection('activities')!} />);
      const summary = await screen.findByRole('button', { name: /^Talk/ });
      await user.click(within(summary).getByText('สัมมนา'));
      await waitFor(() => expect(listed()).toEqual(['Talk']));
    } finally {
      setLanguage('en');
    }
  });
});

describe('location type', () => {
  it("shows an activity's as a pill by the title, not a row, and keeps the place", async () => {
    mockApi({
      '/api/sections/activities': [
        { id: 'a1', name: 'Webinar', locationType: 'Online', createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Fair', location: 'Bangkok', locationType: 'Hybrid', createdAt: '', updatedAt: '' },
        { id: 'a3', name: 'Meetup', location: 'Bangkok', locationType: 'Onsite', createdAt: '', updatedAt: '' },
        { id: 'a4', name: 'Talk', createdAt: '', updatedAt: '' },
      ],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    expect(await screen.findByRole('button', { name: /^Webinar/ })).toHaveTextContent(/^WebinarOnline$/);
    expect(screen.getByRole('button', { name: /^Fair/ })).toHaveTextContent(/^FairHybridLocation:Bangkok/);
    expect(screen.getByRole('button', { name: /^Meetup/ })).toHaveTextContent(/^MeetupOnsiteLocation:Bangkok/);
    expect(screen.getByRole('button', { name: /^Talk/ })).toHaveTextContent(/^Talk$/);
    const dialog = await openEntry(user, 'Fair', 'Activity');
    expect(within(dialog).getAllByText('Hybrid')).toHaveLength(1);
    expect(within(dialog).queryByText('Location type')).not.toBeInTheDocument();
  });

  it('leaves experience with its Online pill', async () => {
    mockApi({
      '/api/sections/experience': [{ id: 'x1', title: 'Remote dev', company: 'X', online: 'true', createdAt: '', updatedAt: '' }],
      '/api/sections/activities': [],
      '/api/sections/projects': [],
      '/api/media': [],
    });
    inRouter(<SectionPage section={getSection('experience')!} />);
    expect(await screen.findByRole('button', { name: /^Remote dev/ })).toHaveTextContent(/^Remote devOnline/);
  });
});

describe('activity progress', () => {
  it('shows a badge from the dates, or the one set by hand', async () => {
    mockApi({
      '/api/sections/activities': [
        { id: 'a1', name: 'Old talk', startDate: '2020-05-01', noEndDate: 'true', createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Far trip', startDate: '2999-01-01', createdAt: '', updatedAt: '' },
        { id: 'a3', name: 'Pitch', startDate: '2999-01-01', progress: 'Rejected', createdAt: '', updatedAt: '' },
      ],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('activities')!} />);
    expect(await screen.findByRole('button', { name: /^Old talk/ })).toHaveTextContent(/^Old talkCompleted/);
    expect(screen.getByRole('button', { name: /^Far trip/ })).toHaveTextContent(/^Far tripNot Started/);
    expect(screen.getByRole('button', { name: /^Pitch/ })).toHaveTextContent(/^PitchRejected/);
    // In the popup it's the title's badge, not a row of its own as well.
    const dialog = await openEntry(user, 'Pitch', 'Activity');
    expect(within(dialog).getAllByText('Rejected')).toHaveLength(1);
  });

  it('shows the Thai name of a progress in Thai, still filtering by the English one', async () => {
    mockApi({
      '/api/sections/activities': [{ id: 'a1', name: 'Pitch', startDate: '2999-01-01', progress: 'Rejected', createdAt: '', updatedAt: '' }],
      '/api/media': [],
    });
    setLanguage('th');
    try {
      inRouter(<SectionPage section={getSection('activities')!} />);
      expect(await screen.findByRole('button', { name: /^Pitch/ })).toHaveTextContent(/^Pitchไม่ผ่านการคัดเลือก/);
    } finally {
      setLanguage('en');
    }
  });
});

describe('in Thai', () => {
  afterEach(() => setLanguage('en'));

  it("switches just the popup between English and Thai, leaving the page's language", async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', name_th: 'ภาพยนตร์', description: 'Cut it.', description_th: 'ตัดต่อ', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    const dialog = await openEntry(user, 'Film', 'Project');
    const languages = within(dialog).getByRole('group', { name: 'Show this in' });
    expect(within(languages).getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText('Cut it.')).toBeInTheDocument();

    await user.click(within(languages).getByRole('button', { name: 'ไทย' }));
    expect(within(dialog).getByText('ภาพยนตร์')).toBeInTheDocument();
    expect(within(dialog).getByText('ตัดต่อ')).toBeInTheDocument();
    // The list behind it, and the profile's language, stay English.
    expect(screen.getByRole('button', { name: /^Film/ })).toBeInTheDocument();
    expect(localStorage.getItem('language')).not.toBe('th');

    await user.click(within(languages).getByRole('button', { name: 'EN' }));
    expect(within(dialog).getByText('Cut it.')).toBeInTheDocument();
  });

  it('shows a project with its Thai text and its organization\'s and skills\' Thai names', async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', name_th: 'ภาพยนตร์', organization: 'Studio X', skills: 'Editing', createdAt: '', updatedAt: '' }],
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/skills': [{ id: 's1', name: 'Editing', name_th: 'ตัดต่อ' }],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/posts': [],
      '/api/media': [],
    });
    setLanguage('th');
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    expect(await screen.findByText('ภาพยนตร์')).toBeInTheDocument();
    expect(await screen.findByText('สตูดิโอเอ็กซ์')).toBeInTheDocument();
    const dialog = await openEntry(user, 'ภาพยนตร์', 'Project');
    expect(await within(dialog).findByRole('link', { name: 'สตูดิโอเอ็กซ์' })).toBeInTheDocument();
    expect(within(dialog).getByText('ตัดต่อ')).toBeInTheDocument();
  });
});

describe('selecting entries', () => {
  const skills = [
    { id: 's1', name: 'React', createdAt: '', updatedAt: '' },
    { id: 's2', name: 'Editing', createdAt: '', updatedAt: '' },
    { id: 's3', name: 'Sound', createdAt: '', updatedAt: '' },
  ];
  const routes = { '/api/sections/skills': skills, '/api/sections/experience': [], '/api/sections/projects': [], '/api/sections/activities': [] };

  it('selects all, then deletes them after asking', async () => {
    const fetch = mockApi(routes);
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : base(url, init)));
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected skills' });
    await user.click(within(toolbar).getByRole('button', { name: 'Select all' }));
    expect(toolbar).toHaveTextContent('3 skills selected');
    await user.click(within(toolbar).getByRole('button', { name: 'Deselect all' }));
    expect(toolbar).not.toHaveTextContent('selected');
    await user.click(within(toolbar).getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sound' }));
    await user.click(within(toolbar).getByRole('button', { name: 'Delete 2 selected' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete 2 skills?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
    const deleted = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);
    expect(deleted.sort()).toEqual(['/api/sections/skills/s1', '/api/sections/skills/s2']);
  });

  it('keeps the ones that failed selected, with the reason', async () => {
    const fetch = mockApi(routes);
    const base = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method !== 'DELETE' ? base(url, init) : url.endsWith('s2') ? Response.json({ error: 'Sheets quota exceeded' }, { status: 503 }) : new Response(null, { status: 204 }),
    );
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select React' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Editing' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 selected' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete 2 skills?' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete 1 skill: Sheets quota exceeded");
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 skill selected');
    expect(screen.getByRole('checkbox', { name: 'Select Editing' })).toBeChecked();
  });

  it('ticks an entry\'s files with it, and lets single files be unticked or ticked on their own', async () => {
    const file = (id: string, entryId: string, title: string) => ({ id, entryId, section: 'projects', title, mimeType: 'image/png', fileName: `${title}.png`, position: '0', createdAt: '' });
    mockApi({
      '/api/sections/projects': [
        { id: 'p1', name: 'Film', createdAt: '', updatedAt: '' },
        { id: 'p2', name: 'Game', createdAt: '', updatedAt: '' },
      ],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [file('m1', 'p1', 'Poster'), file('m2', 'p1', 'Still'), file('m3', 'p2', 'Cover')],
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected projects' });
    await user.click(screen.getByRole('checkbox', { name: 'Select Film' }));
    expect(toolbar).toHaveTextContent('1 project · 2 files selected');
    await user.click(screen.getByRole('button', { name: 'Select Still' }));
    await user.click(screen.getByRole('button', { name: 'Select Cover' }));
    expect(toolbar).toHaveTextContent('1 project · 2 files selected');
    expect(screen.getByRole('button', { name: 'Download the files of the 1 selected project' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Still' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Select Cover' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe("a post's picked media", () => {
  const file = (id: string, title: string) => ({ id, entryId: 'a1', section: 'activities', title, mimeType: 'image/png', fileName: `${title}.png`, size: '4', description: '', position: id, role: '', fileId: `f${id}`, folderId: 'fa1', createdAt: '' });

  it('shows them in the popup, to open and download but not delete, and downloads them from the card', async () => {
    mockApi({
      '/api/sections/posts': [{ id: 'x1', title: 'Recap', status: 'draft', mediaIds: 'm2,gone,m1', activityIds: 'a1', createdAt: '', updatedAt: '' }],
      ...Object.fromEntries(['projects', 'experience', 'education', 'volunteer', 'certifications', 'certificates'].map((k) => [`/api/sections/${k}`, []])),
      '/api/sections/activities': [{ id: 'a1', name: 'Hack day', createdAt: '', updatedAt: '' }],
      // Its own video, uploaded to the post, and two files of the activity it picked.
      '/api/media': [file('m1', 'Photo 1'), file('m2', 'Photo 2'), { ...file('v1', 'Teaser'), entryId: 'x1', section: 'posts', mimeType: 'video/mp4', fileName: 'Teaser.mp4' }],
    });
    const user = userEvent.setup();
    inRouter(<PostsPage section={getSection('posts')!} />);
    // Its own video, then the two picked files that still exist; one download button for all of them.
    expect(await screen.findByRole('button', { name: 'Download all 3 media files' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Download all 1 files|^Download file$/ })).not.toBeInTheDocument();

    const dialog = await openEntry(user, 'Recap', 'Post');
    const box = within(dialog).getByText('Media from other entries', { selector: 'h4' }).closest('section')!;
    expect(within(box).getAllByRole('button', { name: /^Photo/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Photo 2', 'Photo 1']);
    await user.click(within(box).getByRole('button', { name: 'Select files' }));
    expect(within(box).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});

describe('moving an entry back to drafts', () => {
  it('offers Move to drafts on a saved entry, which saves it as a draft and closes', async () => {
    const project = { id: 'p1', name: 'Film', createdAt: '', updatedAt: '' };
    const fetch = mockApi({
      '/api/sections/projects': [project],
      'PUT /api/sections/projects/p1?draft=1': { ...project, draft: 'true' },
      ...Object.fromEntries(['certifications', 'certificates', 'posts', 'activities', 'organizations', 'skills', 'domains', 'locations'].map((k) => [`/api/sections/${k}`, []])),
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });
    const user = userEvent.setup();
    inRouter(<SectionPage section={getSection('projects')!} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    expect(within(dialog).queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Move to drafts' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit project' })).not.toBeInTheDocument());
    expect(fetch.mock.calls.some(([url, init]) => url === '/api/sections/projects/p1?draft=1' && init?.method === 'PUT')).toBe(true);
  });

  it('keeps Save draft on a draft, and none on a section without drafts', async () => {
    mockApi({
      '/api/sections/projects': [{ id: 'p1', name: 'Film', draft: 'true', createdAt: '', updatedAt: '' }],
      ...Object.fromEntries(['certifications', 'certificates', 'posts', 'activities', 'organizations', 'skills', 'domains', 'locations'].map((k) => [`/api/sections/${k}`, []])),
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });
    const user = userEvent.setup();
    const { unmount } = inRouter(<SectionPage section={getSection('projects')!} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(within(screen.getByRole('dialog', { name: 'Edit project' })).getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    unmount();

    mockApi({ '/api/sections/skills': [{ id: 's1', name: 'React', createdAt: '', updatedAt: '' }], '/api/sections/experience': [], '/api/sections/projects': [], '/api/sections/activities': [] });
    inRouter(<SectionPage section={getSection('skills')!} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(within(screen.getByRole('dialog', { name: 'Edit skill' })).queryByRole('button', { name: /draft/i })).not.toBeInTheDocument();
  });
});
