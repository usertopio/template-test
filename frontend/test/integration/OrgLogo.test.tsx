// Organization logos: set in the organization's form, shown before the organization's name.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import SectionPage from '../../src/components/SectionPage';
import { LogoField } from '../../src/components/OrgLogo';
import { mockApi, renderWithQuery } from '../helpers';

const organizations = getSection('organizations')!;
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'fibo.png', { type: 'image/png' });
const logo = { id: 'l1', section: 'organizations', entryId: 'o1', role: 'logo', title: 'Logo', description: '', position: '0', fileName: 'Organization_Logo_Tammasorn.png', mimeType: 'image/png', size: '4', createdAt: '' };
const fibo = { id: 'o1', name: 'Fibo', type: 'Company', createdAt: '', updatedAt: '' };
const requests = (fetch: ReturnType<typeof mockApi>, method: string) => fetch.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

describe('the Logo field', () => {
  it("uploads a saved organization's logo at once, as its logo, and turns down other files", async () => {
    const fetch = mockApi({ '/api/media': [], '/api/health': { ok: true, media: { ok: true } }, 'POST /api/media': logo });
    const user = userEvent.setup({ applyAccept: false });
    renderWithQuery(<LogoField section={organizations} entryId="o1" pending={[]} onPendingChange={() => {}} />);

    await user.upload(screen.getByLabelText('Choose logo'), new File(['%PDF'], 'fibo.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use a JPG or PNG image');
    expect(requests(fetch, 'POST')).toHaveLength(0);

    await user.upload(screen.getByLabelText('Choose logo'), png());
    await waitFor(() => expect(requests(fetch, 'POST')).toHaveLength(1));
    const body = requests(fetch, 'POST')[0][1]!.body as FormData;
    expect([body.get('section'), body.get('entryId'), body.get('title'), body.get('role')]).toEqual(['organizations', 'o1', 'Logo', 'logo']);
  });

  it('takes a logo dropped on the block, as the Media block does', async () => {
    const fetch = mockApi({ '/api/media': [], '/api/health': { ok: true, media: { ok: true } }, 'POST /api/media': logo });
    renderWithQuery(<LogoField section={organizations} entryId="o1" pending={[]} onPendingChange={() => {}} />);
    const block = screen.getByText('Logo').closest('fieldset')!;
    fireEvent.dragOver(block, { dataTransfer: { types: ['Files'] } });
    expect(block.className).toMatch(/outline-dashed/);
    fireEvent.drop(block, { dataTransfer: { files: [png()], types: ['Files'] } });
    expect(block.className).not.toMatch(/outline-dashed/);
    await waitFor(() => expect(requests(fetch, 'POST')).toHaveLength(1));
    expect((requests(fetch, 'POST')[0][1]!.body as FormData).get('role')).toBe('logo');
  });

  it('keeps the logo of a new organization to upload once it is saved', async () => {
    mockApi({ '/api/media': [], '/api/health': { ok: true, media: { ok: true } } });
    const onPendingChange = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<LogoField section={organizations} pending={[]} onPendingChange={onPendingChange} />);
    expect(screen.getByRole('button', { name: 'Upload logo' })).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose logo'), png());
    expect(onPendingChange).toHaveBeenLastCalledWith([expect.objectContaining({ title: 'Logo', role: 'logo', file: expect.any(File) })]);
  });
});

describe('logos before organization names', () => {
  const routes = {
    '/api/sections/organizations': [fibo],
    '/api/sections/projects': [{ id: 'p1', name: 'Film', organization: 'Fibo; Acme', createdAt: '', updatedAt: '' }],
    '/api/sections/certifications': [],
    '/api/sections/certificates': [],
    '/api/sections/posts': [],
    '/api/sections/skills': [],
    '/api/media': [logo],
    '/api/media/l1/thumb?size=200': 'png',
  };

  it("shows an entry's organizations with their logos, on the card and in its popup", async () => {
    mockApi(routes);
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter>
        <SectionPage section={getSection('projects')!} />
      </MemoryRouter>,
    );
    const summary = await screen.findByRole('button', { name: /^Film/ });
    // Each organization a chip of its own, no "; " between them; Fibo has a logo, Acme doesn't.
    const chips = () => [...summary.querySelectorAll('[class*="bg-blue-50"]')];
    await waitFor(() => expect(chips().map((c) => [c.textContent, c.querySelectorAll('img').length])).toEqual([
      ['Fibo', 1],
      ['Acme', 0],
    ]));
    expect(summary).not.toHaveTextContent(';');

    await user.click(summary);
    const dialog = screen.getByRole('dialog', { name: 'Project' });
    const boxes = [...dialog.querySelectorAll('li')];
    expect(boxes.map((li) => [li.textContent, li.querySelectorAll('img').length])).toEqual([
      ['Fibo', 1],
      ['Acme', 0],
    ]);
  });

  it("shows an organization's logo before its name, not as one of its files", async () => {
    mockApi(routes);
    renderWithQuery(
      <MemoryRouter>
        <SectionPage section={organizations} />
      </MemoryRouter>,
    );
    const summary = await screen.findByRole('button', { name: /^Fibo/ });
    await waitFor(() => expect(within(summary).getByRole('presentation')).toHaveAttribute('src', 'blob:preview'));
    expect(summary).not.toHaveTextContent('1 file');
  });
});
