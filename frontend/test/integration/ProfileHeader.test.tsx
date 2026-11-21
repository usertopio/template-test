// The About page's header: profile photo and background image, like LinkedIn.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { getSection } from '@profile/shared';
import AboutPage from '../../src/pages/AboutPage';
import { mockApi, renderWithQuery } from '../helpers';

const about = getSection('about')!;
const me = { id: 'a1', name: 'Tammasorn Pinyo', headline: 'Filmmaker', createdAt: '', updatedAt: '' };
const photo = { id: 'm1', section: 'about', entryId: 'a1', role: 'photo', title: 'Profile photo', description: '', position: '0', fileName: 'About_Profile-photo_Tammasorn.png', mimeType: 'image/png', size: '4', createdAt: '' };
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'banner.png', { type: 'image/png' });

describe('About header', () => {
  it('shows the profile photo, and uploads a background photo as the banner', async () => {
    const fetch = mockApi({
      '/api/single/about': me,
      '/api/media': [photo],
      '/api/media/m1/file': {},
      '/api/health': { ok: true, media: { ok: true } },
      'POST /api/media': { ...photo, id: 'm2', role: 'banner', title: 'Background photo' },
    });
    const user = userEvent.setup();
    renderWithQuery(<AboutPage section={about} />);

    expect(await screen.findByRole('heading', { name: 'Tammasorn Pinyo' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Profile photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change profile photo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove profile photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove background photo' })).not.toBeInTheDocument();
    // No media list in the form: the images live in the header.
    expect(screen.queryByRole('button', { name: /Add media/ })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add background photo' })).toBeEnabled());
    await user.upload(screen.getByLabelText('Choose background photo'), png());
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const body = fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as FormData;
    expect(Object.fromEntries([...body].filter(([k]) => k !== 'file'))).toEqual({ section: 'about', entryId: 'a1', title: 'Background photo', description: '', role: 'banner' });
  });

  it('takes photos before About is saved, previews them, and uploads them once it is', async () => {
    const fetch = mockApi({
      '/api/single/about': null,
      'PUT /api/single/about': { ...me, id: 'a9' },
      '/api/media': [],
      '/api/health': { ok: true, media: { ok: true } },
      'POST /api/media': photo,
    });
    const user = userEvent.setup();
    renderWithQuery(<AboutPage section={about} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add profile photo' })).toBeEnabled());
    await user.upload(screen.getByLabelText('Choose profile photo'), png());
    expect(screen.getByRole('img', { name: 'Profile photo' })).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByText('Your photos upload when you save.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Tammasorn Pinyo');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const body = fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as FormData;
    expect(body.get('entryId')).toBe('a9');
    expect(body.get('role')).toBe('photo');
    await waitFor(() => expect(screen.queryByText('Your photos upload when you save.')).not.toBeInTheDocument());
  });

  it('drops a waiting photo without asking', async () => {
    mockApi({ '/api/single/about': null, '/api/media': [], '/api/health': { ok: true, media: { ok: true } } });
    const user = userEvent.setup();
    renderWithQuery(<AboutPage section={about} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add background photo' })).toBeEnabled());
    await user.upload(screen.getByLabelText('Choose background photo'), png());
    await user.click(screen.getByRole('button', { name: 'Remove background photo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Background photo' })).not.toBeInTheDocument();
  });

  it('refuses files that are not JPG or PNG', async () => {
    mockApi({ '/api/single/about': me, '/api/media': [], '/api/health': { ok: true, media: { ok: true } } });
    const user = userEvent.setup({ applyAccept: false });
    renderWithQuery(<AboutPage section={about} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add profile photo' })).toBeEnabled());
    await user.upload(screen.getByLabelText('Choose profile photo'), new File(['%PDF'], 'me.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Profile photo: use a JPG or PNG image');
  });
});
