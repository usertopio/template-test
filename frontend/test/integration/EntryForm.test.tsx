// The generated form with its organization dropdown and tag pickers, loading suggestions through the real API hooks.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDENTIALS_GROUP, getSection } from '@profile/shared';
import { ApiError } from '../../src/api';
import EntryForm from '../../src/components/EntryForm';
import { setLanguage } from '../../src/language';
import type { PendingMedia } from '../../src/components/MediaField';
import { mockApi, renderWithQuery } from '../helpers';

const projects = getSection('projects')!;
const posts = getSection('posts')!;
const activities = getSection('activities')!;

beforeEach(() => {
  mockApi({
    '/api/sections/organizations': [
      { id: 'o1', name: 'Studio X' },
      { id: 'o2', name: 'Acme' },
    ],
    '/api/sections/skills': [{ id: 's1', name: 'Editing' }],
    '/api/sections/projects': [{ id: 'p1', name: 'Old', skills: 'React, Sound', domain: 'Gaming' }],
    '/api/sections/posts': [
      { id: 'x1', title: 'Old post', hashtags: '#film, #Engineering', projectIds: 'p1' },
      { id: 'x2', title: 'Recap' },
      { id: 'x3', title: 'Summit photos', activityIds: 'a1' },
    ],
    '/api/sections/certifications': [],
    '/api/sections/certificates': [{ id: 'c1', name: 'Data Analytics', issuer: 'Google' }],
    'POST /api/sections/certificates': { id: 'c9', name: 'Data Analytics', issuer: 'Google' },
    'POST /api/sections/posts': { id: 'x9', title: 'Teaser' },
    '/api/sections/experience': [],
    '/api/sections/education': [],
    '/api/sections/volunteer': [],
    '/api/sections/activities': [{ id: 'a1', name: 'Hack day', category: 'Hackathon', domain: 'Cooking' }],
    '/api/sections/domains': [
      { id: 'd1', name: 'Engineering', subdomains: 'DevOps' },
      { id: 'd2', name: 'Biology', subdomains: 'Plant' },
    ],
    '/api/media': [],
    '/api/health': { ok: true, media: { ok: true } },
  });
});

function renderForm(section = projects, initial?: Record<string, string>) {
  const onSubmit = vi.fn(async (_data: Record<string, string>, _media: PendingMedia[]) => {});
  const { unmount } = renderWithQuery(<EntryForm section={section} initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup(), unmount };
}

const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);

describe('groups', () => {
  it('shows the fields in boxes under headings, counting only links', async () => {
    renderForm(projects, { id: 'p9', name: 'Site', description: 'a, b, c', certificateIds: 'c1' });
    const boxes = screen.getAllByRole('group').filter((g) => g.hasAttribute('aria-labelledby'));
    expect(boxes.map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
      'Project',
      'When',
      'Details',
      'Links',
      'Certifications & certificates1 linked',
      'Activities & posts',
      'Files',
    ]);
    expect(within(boxes[0]).getByRole('textbox', { name: /Project name/ })).toHaveValue('Site');
  });

  it('keeps the start and end dates on one line, below the place', async () => {
    renderForm(getSection('experience')!, { id: 'e1', title: 'Dev', company: 'Acme' });
    const row = screen.getByLabelText(/^Start date/).parentElement!.parentElement!;
    expect(row).toContainElement(screen.getByLabelText(/^End date/));
    // The place stays out of it, so "Online" can't land beside the start date.
    expect(row).not.toContainElement(screen.getByRole('checkbox', { name: 'Online' }));
    expect(row.parentElement).toContainElement(screen.getByRole('checkbox', { name: /I currently work here/ }));
  });

  it('keeps the domain and subdomain on one line, apart from the name and category', async () => {
    renderForm(activities);
    const rowOf = (label: RegExp) => screen.getByText(label, { selector: 'label' }).parentElement!.parentElement!.parentElement!;
    expect(rowOf(/^Domain/)).toBe(rowOf(/^Subdomain/));
    expect(rowOf(/^Domain/)).not.toContainElement(screen.getByRole('textbox', { name: /^Name/ }));
    expect(rowOf(/^Domain/)).not.toContainElement(screen.getByText(/^Category/, { selector: 'label' }));
    // The application dates are a pair of their own too.
    expect(rowOf(/^Application deadline/)).toBe(rowOf(/^Results announcement date/));
  });

  it('opens an old "Cancelled" activity with its new name picked, so saving it is accepted', async () => {
    const { user, onSubmit } = renderForm(activities, { id: 'a1', name: 'Talk', progress: 'Cancelled' });
    expect(screen.getByRole('combobox', { name: /^Progress/ })).toHaveValue('Cancelled by Organizer');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ progress: 'Cancelled by Organizer' });
  });
});

describe('no end date', () => {
  it('hides and clears the end date when ticked', async () => {
    const { user, onSubmit } = renderForm(activities, { id: 'a1', name: 'Talk', startDate: '2025-04-01', endDate: '2025-04-02' });
    expect(screen.getByLabelText(/^End date/)).toHaveValue('2025-04-02');
    await user.click(screen.getByRole('checkbox', { name: /No end date/ }));
    expect(screen.queryByLabelText(/^End date/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ noEndDate: 'true', endDate: '' });
  });

  it.each(['certificates', 'certifications'])('hides and clears the expiration date of %s with "No expiration date"', async (key) => {
    const { user, onSubmit } = renderForm(getSection(key)!, { id: 'c1', name: 'Cloud', issuer: 'Acme', issueDate: '2025-04-01', expiryDate: '2028-04-01' });
    await user.click(screen.getByRole('checkbox', { name: /No expiration date/ }));
    expect(screen.queryByLabelText(/^Expiration date/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ noExpiryDate: 'true', expiryDate: '' });
  });
});

describe('domain', () => {
  it('offers the domains on the Domains page, not others used on entries', async () => {
    const { user } = renderForm(activities);
    await user.click(screen.getByRole('combobox', { name: /^Domain/ }));
    await waitFor(() => expect(options()).toEqual(['Biology', 'Engineering']));
  });

  const domainPage = () =>
    mockApi({
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/projects': [{ id: 'p1', name: 'Bot', domain: 'Engineering', subdomain: 'Robotics' }],
      '/api/sections/activities': [{ id: 'a1', name: 'Shoot', domain: 'Film', subdomain: 'Lighting' }],
      '/api/sections/domains': [
        { id: 'd1', name: 'Engineering', name_th: 'วิศวกรรม', subdomains: 'Web Development, DevOps, AI & Data, Cloud', subdomains_th: 'DevOps=เดฟออปส์' },
        { id: 'd2', name: 'Film', subdomains: 'Lighting' },
        { id: 'd3', name: 'Biology', subdomains: 'Plant, Exotic pet' },
      ],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });

  it('takes several domains and subdomains, offering the subdomains under the domains picked', async () => {
    domainPage();
    const { user, onSubmit } = renderForm(activities, { id: 'a2', name: 'Talk', domain: 'Engineering' });
    await user.type(screen.getByRole('combobox', { name: /^Domain/ }), 'Biology{Enter}');
    await user.click(screen.getByRole('combobox', { name: /^Subdomain/ }));
    await waitFor(() => expect(options()).toEqual(expect.arrayContaining(['DevOps', 'Cloud', 'Plant', 'Exotic pet'])));
    expect(options()).not.toContain('Lighting');
    await user.click(screen.getByRole('option', { name: 'DevOps' }));
    await user.type(screen.getByRole('combobox', { name: /^Subdomain/ }), 'Plant{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ domain: 'Engineering, Biology', subdomain: 'DevOps, Plant' });
  });

  it("drops a domain's subdomains when it's taken off, keeping the others and new ones", async () => {
    domainPage();
    const { user, onSubmit } = renderForm(projects, { id: 'p2', name: 'Site', domain: 'Engineering, Biology', subdomain: 'DevOps, Plant, Hydroponics' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Biology' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Remove Biology' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ domain: 'Engineering', subdomain: 'DevOps, Hydroponics' });
  });

  it('shows them by their Thai names from the Domains page on the Thai side', async () => {
    domainPage();
    const { user } = renderForm(projects, { id: 'p2', name: 'Site', domain: 'Engineering', subdomain: 'DevOps, Cloud' });
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(await screen.findByRole('button', { name: 'Remove วิศวกรรม' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove เดฟออปส์' })).toBeInTheDocument();
    // No Thai yet: the English.
    expect(screen.getByRole('button', { name: 'Remove Cloud' })).toBeInTheDocument();
  });

  it("gives each subdomain its Thai on the Domains page's Thai side", async () => {
    domainPage();
    const { user, onSubmit } = renderForm(getSection('domains')!, { id: 'd1', name: 'Engineering', subdomains: 'DevOps, Cloud', subdomains_th: 'DevOps=เดฟออปส์' });
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(screen.getByRole('textbox', { name: 'DevOps' })).toHaveValue('เดฟออปส์');
    await user.type(screen.getByRole('textbox', { name: 'Cloud' }), 'คลาวด์');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ subdomains: 'DevOps, Cloud', subdomains_th: 'DevOps=เดฟออปส์, Cloud=คลาวด์' });
  });

  it('saves new domains typed in', async () => {
    const { user, onSubmit } = renderForm(projects);
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Reef tank');
    await user.type(screen.getByRole('combobox', { name: /^Domain/ }), 'Aquariums{Enter}Pets{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Reef tank', domain: 'Aquariums, Pets' }), []);
  });
});

describe('organization dropdown', () => {
  it('lists every organization, sorted, when opened', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('combobox', { name: /^Organization/ }));
    await waitFor(() => expect(options()).toEqual(['Acme', 'Studio X']));
  });

  it('picks an existing organization with the keyboard', async () => {
    const { user, onSubmit } = renderForm();
    const input = screen.getByRole('combobox', { name: /^Organization/ });
    await user.type(input, 'stu');
    await waitFor(() => expect(options()[0]).toBe('Studio X'));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove Studio X' })).toBeInTheDocument();
    expect(input).toHaveValue('');

    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Film');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Film', organization: 'Studio X' }), []);
  });

  it('offers to add an organization that does not exist yet', async () => {
    const { user } = renderForm();
    const input = screen.getByRole('combobox', { name: /^Organization/ });
    await user.type(input, 'New  Studio');
    await waitFor(() => expect(options()).toEqual(['Add “New  Studio” as a new organization']));
    await user.click(screen.getByRole('option'));
    expect(screen.getByRole('button', { name: 'Remove New Studio' })).toBeInTheDocument();
  });

  it('takes several organizations, separated by ";" when stored', async () => {
    const { user, onSubmit } = renderForm(projects, { id: 'p1', name: 'Film', organization: 'Studio X' });
    const input = screen.getByRole('combobox', { name: /^Organization/ });
    // Already picked ones aren't offered again; ";" (typed or pasted) finishes a name.
    await user.click(input);
    await waitFor(() => expect(options()).toEqual(['Acme']));
    await user.type(input, 'Acme, Inc.;');
    expect(screen.getByRole('button', { name: 'Remove Acme, Inc.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ organization: 'Studio X; Acme, Inc.' }), []);
  });

  it('closes on Escape without closing anything else', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('combobox', { name: /^Organization/ }));
    await screen.findByRole('listbox');
    const keydown = vi.fn();
    document.addEventListener('keydown', keydown);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', keydown);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(keydown).not.toHaveBeenCalled(); // stopped, so the modal around the form stays open
  });
});

describe('category dropdown', () => {
  it('offers the preset categories and the ones already used, sorted', async () => {
    const { user } = renderForm(activities);
    await user.click(screen.getByRole('combobox', { name: /^Category/ }));
    await waitFor(() => expect(options()).toEqual(['Competition', 'Conference', 'Hackathon', 'Meetup', 'Seminar', 'Training', 'Webinar', 'Workshop']));
  });

  it('adds a new category and submits it', async () => {
    const { user, onSubmit } = renderForm(activities, { name: 'Talk' });
    await user.type(screen.getByRole('combobox', { name: /^Category/ }), 'Bootcamp');
    await waitFor(() => expect(options()).toEqual(['Add “Bootcamp” as a new category']));
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Talk', category: 'Bootcamp' }), []);
  });
});

describe('tag pickers', () => {
  it('suggests skills from other projects and the Skills page, minus ones already picked', async () => {
    const { user } = renderForm(projects, { name: 'App', skills: 'React' });
    await user.click(screen.getByRole('combobox', { name: 'Skills' }));
    await waitFor(() => expect(options()).toEqual(['Editing', 'Sound']));
  });

  it('adds typed tags with Enter or a comma, removes them, and submits them as a comma list', async () => {
    const { user, onSubmit } = renderForm(posts, { title: 'Hello' });
    const input = screen.getByRole('combobox', { name: /^Hashtags/ });
    await user.type(input, 'film');
    // '#' is ignored when matching, so "film" finds "#film" and isn't offered as new.
    await waitFor(() => expect(options()).toEqual(['#film']));
    await user.keyboard('{Enter}'); // picks the existing "#film"
    await user.type(input, '#new, #other,');
    expect(screen.getByRole('button', { name: 'Remove #new' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove #other' }));
    await user.type(input, '#film{Enter}'); // duplicates are ignored
    await user.type(input, '{Backspace}'); // empty box: removes the last tag
    await user.type(input, '#late');
    await user.click(screen.getByRole('button', { name: 'Save' })); // blur keeps the half-typed tag

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello', hashtags: '#film, #late' }), []);
  });
});

describe('post links', () => {
  it('keeps the link pickers in an open "Linked to" box and submits the picked ids', async () => {
    const { user, onSubmit } = renderForm(posts, { title: 'Launch' });
    // Nothing to unfold first.
    const box = screen.getByRole('group', { name: /^Linked to/ });
    expect(box.closest('details')).toBeNull();
    await user.click(await within(box).findByRole('checkbox', { name: /Old/ }));
    expect(box).toHaveTextContent(/^Linked to1 linked/);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Launch', projectIds: 'p1', certificationIds: '' }), []);
  });
});

describe('server validation errors', () => {
  it('names each invalid field in the message and marks the field', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError('Validation failed', 400, { url: 'Must be a valid URL, e.g. https://example.com' });
    });
    renderWithQuery(<EntryForm section={projects} initial={{ name: 'Film' }} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Project URL: Must be a valid URL, e.g. https://example.com')).toBeInTheDocument();
    expect(screen.getByText('Must be a valid URL, e.g. https://example.com')).toBeInTheDocument();
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project URL' })).toHaveFocus();
  });
});

describe('creating a certificate from a project', () => {
  it('saves it in its own dialog and links it, without submitting the project', async () => {
    const { user, onSubmit } = renderForm(projects, { name: 'Film' });
    await user.click(screen.getByRole('button', { name: '+ New certificate' }));
    const dialog = screen.getByRole('dialog', { name: 'New certificate' });
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Data Analytics');
    await user.type(within(dialog).getByRole('combobox', { name: /Issued by/ }), 'Google');
    await user.click(within(dialog).getByRole('button', { name: 'Save and link' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
    const posted = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) => url === '/api/sections/certificates' && init?.method === 'POST')!;
    expect(JSON.parse(posted[1].body)).toMatchObject({ name: 'Data Analytics', issuer: 'Google' });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Film', certificateIds: 'c9', certificationIds: '' }), []);
  });

  it("starts a new certificate or certification from an activity with its name, organizer and posts", async () => {
    const { user } = renderForm(activities, { id: 'a1', name: 'AWS Summit', name_th: 'งาน AWS', organizer: 'Acme' });
    await within(screen.getByRole('group', { name: /^Linked posts/ })).findByRole('checkbox', { name: /Summit photos/ });
    for (const item of ['certificate', 'certification']) {
      await user.click(screen.getByRole('button', { name: `+ New ${item}` }));
      const dialog = screen.getByRole('dialog', { name: `New ${item}` });
      expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('AWS Summit');
      expect(within(dialog).getByRole('checkbox', { name: /Summit photos/ })).toBeChecked();
      await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    }
    await user.click(screen.getByRole('button', { name: '+ New certificate' }));
    await user.click(within(screen.getByRole('dialog', { name: 'New certificate' })).getByRole('button', { name: 'Save and link' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [, init] = vi.mocked(globalThis.fetch).mock.calls.find(([url, init]) => url === '/api/sections/certificates' && init?.method === 'POST')!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ name: 'AWS Summit', name_th: 'งาน AWS', issuer: 'Acme', 'linkedFrom:posts': 'x3' });
  });

  it("links a new certificate to the posts as ticked on the activity, before it's saved", async () => {
    const { user } = renderForm(activities, { id: 'a1', name: 'AWS Summit', organizer: 'Acme' });
    const posts = screen.getByRole('group', { name: /^Linked posts/ });
    await user.click(await within(posts).findByRole('checkbox', { name: /Summit photos/ }));
    await user.click(within(posts).getByRole('checkbox', { name: /Recap/ }));
    await user.click(screen.getByRole('button', { name: '+ New certificate' }));
    const dialog = screen.getByRole('dialog', { name: 'New certificate' });
    expect(within(dialog).getByRole('checkbox', { name: /Recap/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Summit photos/ })).not.toBeChecked();
  });

  it("leaves a new certificate unnamed on other forms", async () => {
    const { user } = renderForm(projects, { name: 'Film' });
    await user.click(screen.getByRole('button', { name: '+ New certificate' }));
    expect(within(screen.getByRole('dialog', { name: 'New certificate' })).getByRole('textbox', { name: /^Name/ })).toHaveValue('');
  });
});

describe('save draft', () => {
  it('offers "Save draft" only when the page allows it, and passes the values', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const onSubmit = vi.fn(async () => {});
    const { unmount } = renderWithQuery(<EntryForm section={projects} onSubmit={onSubmit} onSaveDraft={onSaveDraft} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Role/ }), 'Editor');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ name: '', role: 'Editor' }), []);
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();

    renderWithQuery(<EntryForm section={projects} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});

describe('linked posts', () => {
  it("ticks the posts already linking a project, and sends the new choice to store on the posts", async () => {
    const { user, onSubmit } = renderForm(projects, { id: 'p1', name: 'Old' });
    const box = screen.getByRole('group', { name: /^Linked posts/ });
    expect(await within(box).findByRole('checkbox', { name: /Old post/ })).toBeChecked();
    expect(within(box).getByRole('checkbox', { name: /Recap/ })).not.toBeChecked();

    await user.click(within(box).getByRole('checkbox', { name: /Recap/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Old', 'linkedFrom:posts': 'x1,x2' }), []);
  });

  it("doesn't send the posts when they weren't changed", async () => {
    const { user, onSubmit } = renderForm(projects, { id: 'p1', name: 'Old' });
    await within(screen.getByRole('group', { name: /^Linked posts/ })).findByRole('checkbox', { name: /Old post/ });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('linkedFrom:posts');
  });

  it('creates a new post with "+ New post" and links it when the project is saved', async () => {
    const { user, onSubmit } = renderForm(projects, { id: 'p1', name: 'Old' });
    const box = screen.getByRole('group', { name: /^Linked posts/ });
    await within(box).findByRole('checkbox', { name: /Old post/ });
    await user.click(within(box).getByRole('button', { name: '+ New post' }));
    const dialog = screen.getByRole('dialog', { name: 'New post' });
    await user.clear(within(dialog).getByRole('textbox', { name: /^Title/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /^Title/ }), 'Teaser');
    await user.click(within(dialog).getByRole('button', { name: 'Save and link' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ 'linkedFrom:posts': 'x1,x9' }), []);
  });

  it("starts a new post with the entry's name as its title, in English and Thai", async () => {
    const { user } = renderForm(activities, { id: 'a1', name: 'AWS Summit', name_th: 'งาน AWS' });
    await user.click(within(screen.getByRole('group', { name: /^Linked posts/ })).getByRole('button', { name: '+ New post' }));
    const dialog = screen.getByRole('dialog', { name: 'New post' });
    expect(within(dialog).getByRole('textbox', { name: /^Title/ })).toHaveValue('AWS Summit');
    await user.click(within(dialog).getByRole('button', { name: 'Save and link' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const fetch = vi.mocked(globalThis.fetch);
    const [, init] = fetch.mock.calls.find(([url, init]) => url === '/api/sections/posts' && init?.method === 'POST')!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ title: 'AWS Summit', title_th: 'งาน AWS', status: 'draft' });
  });

  it('leaves a new post untitled while the entry has no name yet', async () => {
    const { user } = renderForm(activities);
    await user.click(within(screen.getByRole('group', { name: /^Linked posts/ })).getByRole('button', { name: '+ New post' }));
    expect(within(screen.getByRole('dialog', { name: 'New post' })).getByRole('textbox', { name: /^Title/ })).toHaveValue('');
  });

  it('goes back from "+ New post" to the form with the back arrow', async () => {
    const { user } = renderForm(projects, { id: 'p1', name: 'Old' });
    await user.click(within(screen.getByRole('group', { name: /^Linked posts/ })).getByRole('button', { name: '+ New post' }));
    await user.click(within(screen.getByRole('dialog', { name: 'New post' })).getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Project name/ })).toHaveValue('Old');
  });

  it('is not offered on a post itself', () => {
    renderForm(posts, { title: 'Launch' });
    expect(screen.queryByRole('group', { name: /^Linked posts/ })).not.toBeInTheDocument();
  });
});

describe('link picker', () => {
  it('keeps a link to an entry the list has not loaded yet when another box is ticked', async () => {
    const { user, onSubmit } = renderForm(projects, { name: 'Film', certificateIds: 'c-new' }); // just made with "+ New"
    // Always open: no box to unfold first.
    const box = screen.getByRole('group', { name: new RegExp(`^${CREDENTIALS_GROUP}`) });
    expect(box.closest('details')).toBeNull();
    await user.click(await within(box).findByRole('checkbox', { name: /Data Analytics/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ certificateIds: 'c1,c-new' }), []);
  });
});

describe('copying in forms', () => {
  it('offers a copy icon for each filled field', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const { user } = renderForm(projects, { name: 'Film', role: '' });
    expect(screen.queryByRole('button', { name: 'Copy role' })).not.toBeInTheDocument(); // empty: nothing to copy
    await user.click(screen.getByRole('button', { name: 'Copy project name' }));
    expect(await navigator.clipboard.readText()).toBe('Film'); // userEvent's stand-in clipboard
  });
});

describe('a certificate linked elsewhere', () => {
  const routes = (extra: Record<string, unknown> = {}) => ({
    '/api/sections/organizations': [],
    '/api/sections/skills': [],
    '/api/sections/projects': [{ id: 'p1', name: 'Film', certificateIds: 'c1' }],
    '/api/sections/certificates': [{ id: 'c1', name: 'Data Analytics', issuer: 'Google' }],
    '/api/sections/certifications': [{ id: 'k1', name: 'AWS', issuer: 'Amazon' }],
    '/api/sections/experience': [{ id: 'e1', title: 'Dev', company: 'X', certificationIds: 'k1' }],
    '/api/sections/volunteer': [{ id: 'v1', role: 'Mentor', organization: 'Red Cross', certificateIds: 'c1' }],
    '/api/media': [],
    '/api/health': { ok: true, media: { ok: true } },
    ...extra,
  });

  it("can't be picked while another project has it, until it's unlinked there", async () => {
    const fetch = mockApi(routes({ 'DELETE /api/sections/projects/p1/links/certificates/c1': { id: 'p1', name: 'Film', certificateIds: '' } }));
    const { user } = renderForm(projects, { id: 'p2', name: 'App', certificateIds: '' });
    await user.click(screen.getByText(CREDENTIALS_GROUP));

    // Project p1 has it, so project p2 can't; volunteer v1 having it doesn't matter.
    const box = await screen.findByRole('group', { name: 'Where “Data Analytics” is also linked' });
    expect(box).toHaveTextContent('Already linked to another project (unlink it there to link it here):Project: Film');
    expect(box).not.toHaveTextContent('Mentor');
    expect(screen.getByRole('checkbox', { name: /Data Analytics/ })).toBeDisabled();

    await user.click(within(box).getByRole('button', { name: 'Unlink Data Analytics from Film' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => init?.method === 'DELETE' && url === '/api/sections/projects/p1/links/certificates/c1')).toBe(true));
  });

  it('can be picked when only other sections have it, and lists them once picked', async () => {
    mockApi(routes());
    // Editing volunteer v1, which has it: its own link doesn't count, and project p1's (another section) is only mentioned.
    const { user } = renderForm(getSection('volunteer')!, { id: 'v1', role: 'Mentor', organization: 'Red Cross', certificateIds: 'c1' });
    await user.click(screen.getByText(CREDENTIALS_GROUP));
    const box = await screen.findByRole('group', { name: 'Where “Data Analytics” is also linked' });
    expect(box).toHaveTextContent('Also linked to:Project: Film');
    expect(box).not.toHaveTextContent('Mentor');
    expect(screen.getByRole('checkbox', { name: /Data Analytics/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Data Analytics/ })).toBeEnabled();

    // A certification linked elsewhere is only mentioned once picked.
    const aws = await screen.findByRole('checkbox', { name: /AWS/ });
    expect(aws).toBeEnabled();
    await user.click(aws);
    expect(await screen.findByRole('group', { name: 'Where “AWS” is also linked' })).toHaveTextContent('Also linked to:Experience: Dev');
  });
});

describe('location', () => {
  it('offers the places on the Locations page, and keeps the details apart', async () => {
    mockApi({
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/activities': [],
      '/api/sections/domains': [],
      '/api/sections/locations': [
        { id: 'l1', name: 'Bangkok' },
        { id: 'l2', name: 'Chiang Mai' },
      ],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });
    const { user, onSubmit } = renderForm(activities, { id: 'a1', name: 'Talk' });
    await user.click(screen.getByRole('combobox', { name: /^Location$/ }));
    await waitFor(() => expect(options()).toEqual(['Bangkok', 'Chiang Mai']));
    await user.click(screen.getByRole('option', { name: 'Bangkok' }));
    await user.type(screen.getByRole('textbox', { name: /^Location detail/ }), 'Building A, 5th floor, room 502');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ location: 'Bangkok', locationDetail: 'Building A, 5th floor, room 502' });
  });
});

describe('Thai version', () => {
  const experience = getSection('experience')!;
  afterEach(() => setLanguage('en'));

  it('edits the Thai text of translated fields and shares the rest', async () => {
    const { user, onSubmit } = renderForm(experience, { id: 'x1', title: 'Editor', company: 'Studio X', location: 'Bangkok' });
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    const title = screen.getByRole('textbox', { name: /Title/ });
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Editor');
    await user.type(title, 'บรรณาธิการ');
    // The company isn't translated per entry: the Thai side gives the organization its Thai name.
    expect(screen.getByRole('textbox', { name: /Company/ })).toHaveAttribute('placeholder', 'Studio X');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // The place gets its Thai on the Locations page; the details here are the entry's own.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Editor', title_th: 'บรรณาธิการ', company: 'Studio X', location: 'Bangkok', locationDetail_th: '' });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('location_th');
    // Not typed: the organization's Thai name is left as it is.
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('organizationThai:company');
  });

  it('opens in the language the profile is shown in, and goes back to English for a missing required field', async () => {
    setLanguage('th');
    const onSubmit = vi.fn(async () => {
      throw new ApiError('Validation failed', 400, { title: 'Title is required' });
    });
    renderWithQuery(<EntryForm section={experience} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  const thaiNames = () =>
    mockApi({
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/skills': [{ id: 's1', name: 'Editing', name_th: 'ตัดต่อ' }],
      '/api/sections/projects': [],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
    });

  it("shows each organization's Thai name on the Thai side, and changes it there", async () => {
    thaiNames();
    const { user, onSubmit } = renderForm(projects, { id: 'p1', name: 'Film', organization: 'Studio X; Blue Reef', skills: 'Editing' });
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    const studio = screen.getByRole('textbox', { name: 'Studio X' });
    await waitFor(() => expect(studio).toHaveValue('สตูดิโอเอ็กซ์'));
    expect(screen.getByText('The Thai name of “Studio X”, shown wherever it appears.')).toBeInTheDocument();
    expect(screen.getByText('A new organization: “Blue Reef” is added with this Thai name when you save.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove ตัดต่อ' })).toBeInTheDocument();

    await user.clear(studio);
    await user.type(studio, 'สตูดิโอ เอ็กซ์');
    await user.type(screen.getByRole('textbox', { name: 'Blue Reef' }), 'บลูรีฟ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ organization: 'Studio X; Blue Reef', 'organizationThai:Studio X': 'สตูดิโอ เอ็กซ์', 'organizationThai:Blue Reef': 'บลูรีฟ' });
  });

  it('drops the Thai name typed for an organization taken off again', async () => {
    thaiNames();
    const { user, onSubmit } = renderForm(projects);
    await user.type(screen.getByRole('textbox', { name: /Project name/ }), 'Reef tank');
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(screen.getByText('Pick the organization on the English side first.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.type(screen.getByRole('combobox', { name: /^Organization/ }), 'Blue Reef{Enter}');
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    await user.type(screen.getByRole('textbox', { name: 'Organization in Thai' }), 'บลูรีฟ');

    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Remove Blue Reef' }));
    await user.type(screen.getByRole('combobox', { name: /^Organization/ }), 'Red Reef{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Reef tank', organization: 'Red Reef' });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('organizationThai:Blue Reef');
  });
});

describe('links', () => {
  it('adds links a row each, with a title and an address, and removes them', async () => {
    const { user, onSubmit } = renderForm(activities, { name: 'Talk', links: 'Old | https://old.test' });
    expect(screen.getByRole('textbox', { name: 'Link 1 title' })).toHaveValue('Old');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByRole('textbox', { name: 'Link 2 title' }), 'Recording');
    await user.type(screen.getByRole('textbox', { name: 'Link 2 URL' }), 'https://video.test/1');
    // An empty row (just added, or emptied while retyping) stays until it's removed.
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.clear(screen.getByRole('textbox', { name: 'Link 1 title' }));
    await user.clear(screen.getByRole('textbox', { name: 'Link 1 URL' }));
    expect(screen.getAllByRole('textbox', { name: /^Link \d title$/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove link 1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0].links).toBe('Recording | https://video.test/1');
  });

  it("notes an organization's sign-up email for its website and for each other link, and no one else's", async () => {
    const { user, onSubmit, unmount } = renderForm(getSection('organizations')!, { name: 'Chulalongkorn University', links: 'Chula MOOC | https://a.test/3 | old@example.com' });
    expect(screen.getByRole('textbox', { name: 'Link 1 sign-up email' })).toHaveValue('old@example.com');
    await user.clear(screen.getByRole('textbox', { name: 'Link 1 sign-up email' }));
    await user.type(screen.getByRole('textbox', { name: 'Link 1 sign-up email' }), 'me@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Website sign-up email' }), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ links: 'Chula MOOC | https://a.test/3 | me@example.com', websiteEmail: 'me@example.com' });
    unmount();

    renderForm(activities, { name: 'Talk' });
    expect(screen.queryByRole('textbox', { name: 'Link 1 sign-up email' })).not.toBeInTheDocument();
  });
});

describe("a post's media", () => {
  const file = (id: string, entryId: string, section: string, title: string, mimeType = 'image/png') =>
    ({ id, entryId, section, title, mimeType, fileName: `${title}.png`, description: '', position: id, role: '', createdAt: '' });

  it('picks files already saved with other entries, linked ones first, in the order ticked', async () => {
    mockApi({
      ...Object.fromEntries(['organizations', 'skills', 'certifications', 'certificates', 'experience', 'education', 'volunteer', 'posts', 'domains'].map((k) => [`/api/sections/${k}`, []])),
      '/api/sections/activities': [{ id: 'a1', name: 'Hack day', createdAt: '', updatedAt: '' }],
      '/api/sections/projects': [{ id: 'p1', name: 'Film', createdAt: '', updatedAt: '' }],
      '/api/media': [file('m1', 'a1', 'activities', 'Photo 1'), file('m2', 'a1', 'activities', 'Photo 2'), file('m4', 'a1', 'activities', 'Notes', 'text/plain'), file('m3', 'p1', 'projects', 'Poster')],
      '/api/health': { ok: true, media: { ok: true } },
    });
    const { user, onSubmit } = renderForm(posts, { id: 'x1', title: 'Recap', activityIds: 'a1' });
    await user.click(screen.getByRole('button', { name: 'Choose media' }));
    const chooser = screen.getByRole('dialog', { name: 'Choose media' });
    const linked = within(chooser).getByRole('region', { name: 'From linked entries' });
    expect(await within(linked).findByRole('button', { name: 'Photo 1' })).toBeInTheDocument();
    expect(within(linked).getByRole('group', { name: 'Activities: Hack day' })).toBeInTheDocument();
    // A text file can't go in a post.
    expect(within(chooser).queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    const others = within(chooser).getByRole('region', { name: 'Other entries' });
    expect(within(others).getByRole('button', { name: 'Poster' })).toBeInTheDocument();

    await user.click(within(linked).getByRole('button', { name: 'Photo 2' }));
    await user.click(within(linked).getByRole('button', { name: 'Photo 1' }));
    await user.click(within(others).getByRole('button', { name: 'Poster' }));
    expect(within(linked).getByRole('button', { name: 'Photo 2' })).toHaveAttribute('aria-pressed', 'true');
    // Search narrows the entries.
    await user.type(within(chooser).getByRole('searchbox', { name: 'Search files and entries' }), 'film');
    expect(within(chooser).queryByRole('button', { name: 'Photo 1' })).not.toBeInTheDocument();
    await user.click(within(chooser).getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('button', { name: 'Move “Poster” earlier' }));
    await user.click(screen.getByRole('button', { name: 'Remove “Photo 1”' }));
    expect(screen.getByText('Project: Film')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mediaIds: 'm2,m3' }), []);
  });

  it('also takes its own uploads, videos too, in one Media block with no detail files', async () => {
    renderForm(posts, { title: 'Recap' });
    expect(screen.getByLabelText('Choose media files').getAttribute('accept')).toContain('video/mp4');
    expect(screen.queryByLabelText('Choose detail files')).not.toBeInTheDocument();
  });

  it('says to link an entry first when the post links none', async () => {
    const { user } = renderForm(posts, { title: 'Recap' });
    await user.click(screen.getByRole('button', { name: 'Choose media' }));
    expect(within(screen.getByRole('dialog', { name: 'Choose media' })).getByText(/Link this post to an activity/)).toBeInTheDocument();
  });
});
