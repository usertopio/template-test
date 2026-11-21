// A card's media block: Hide media / Show media, remembered per entry.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSection, type Entry, type MediaItem } from '@profile/shared';
import { CardMedia } from '../../src/components/EntryCard';
import { MediaStrip } from '../../src/components/Media';
import { setMediaHidden } from '../../src/hiddenMedia';
import { mockApi, renderWithQuery } from '../helpers';

const projects = getSection('projects')!;
const certificates = getSection('certificates')!;
const entry = (id: string, name: string) => ({ id, name, createdAt: '', updatedAt: '' }) as Entry;
const file = (id: string, entryId: string, title: string, role = '') =>
  ({ id, entryId, title, role, description: '', mimeType: 'application/pdf', fileName: `${title}.pdf`, position: id, createdAt: '' }) as MediaItem;
const media = [file('1', 'p1', 'Poster'), file('2', 'p1', 'A_very_long_file_name_that_would_not_fit_on_one_line_of_the_card'), file('3', 'p2', 'Script')];

beforeEach(() => {
  mockApi({});
});
afterEach(() => {
  setMediaHidden('p1', false);
  setMediaHidden('p2', false);
});

describe('CardMedia', () => {
  it('hides and shows the media of one entry, and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithQuery(
      <>
        <CardMedia section={projects} entry={entry('p1', 'Film')} media={media} />
        <CardMedia section={projects} entry={entry('p2', 'Book')} media={media} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Poster' })).toBeInTheDocument();
    // The whole title shows, wrapping rather than cut off.
    expect(screen.getByText('A_very_long_file_name_that_would_not_fit_on_one_line_of_the_card')).not.toHaveClass('truncate');

    await user.click(screen.getAllByRole('button', { name: 'Hide media' })[0]);
    expect(screen.queryByRole('button', { name: 'Poster' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show media (2)' })).toHaveAttribute('aria-expanded', 'false');
    // The other entry keeps its media.
    expect(screen.getByRole('button', { name: 'Script' })).toBeInTheDocument();

    unmount();
    renderWithQuery(<CardMedia section={projects} entry={entry('p1', 'Film')} media={media} />);
    expect(screen.queryByRole('button', { name: 'Poster' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hiddenMedia')!)).toEqual(['p1']);
    await user.click(screen.getByRole('button', { name: 'Show media (2)' }));
    expect(screen.getByRole('button', { name: 'Poster' })).toBeInTheDocument();
  });

  it('hides the certificate file and the other media together', async () => {
    const user = userEvent.setup();
    const cert = [file('1', 'c1', 'Scan', 'credential'), file('2', 'c1', 'Photo', 'media')];
    renderWithQuery(<CardMedia section={certificates} entry={entry('c1', 'AWS')} media={cert} />);
    await user.click(screen.getByRole('button', { name: 'Hide media' }));
    expect(screen.queryByText('Certificate file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show media (2)' })).toBeInTheDocument();
    setMediaHidden('c1', false);
  });

  it('has no button when the entry has no media', () => {
    renderWithQuery(<CardMedia section={projects} entry={entry('p9', 'Empty')} media={media} />);
    expect(screen.queryByRole('button', { name: /media/ })).not.toBeInTheDocument();
  });
});

describe('Google Drive links', () => {
  const inDrive = (id: string, entryId: string, title: string, folderId: string) => ({ ...file(id, entryId, title), fileId: `f${id}`, folderId }) as MediaItem;

  it("opens an entry's folder from its files, and each file and its folder from the file", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CardMedia section={projects} entry={entry('p1', 'Film')} media={[inDrive('1', 'p1', 'Poster', 'folder1'), inDrive('2', 'p1', 'Still', 'folder1')]} />);
    expect(screen.getByRole('link', { name: 'Open folder in Google Drive' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/folder1');
    expect(screen.getByRole('link', { name: 'Open folder in Google Drive' })).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'Poster' }));
    const viewer = screen.getByRole('dialog', { name: 'Poster' });
    expect(within(viewer).getByRole('link', { name: 'Open in Google Drive' })).toHaveAttribute('href', 'https://drive.google.com/file/d/f1/view');
    expect(within(viewer).getByRole('link', { name: 'Open folder in Google Drive' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/folder1');
  });

  it('has no folder link for files from several folders, and none to delete when they belong elsewhere', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MediaStrip items={[inDrive('1', 'p1', 'Poster', 'folder1'), inDrive('3', 'p2', 'Script', 'folder2')]} canDelete={false} />);
    expect(screen.queryByRole('link', { name: 'Open folder in Google Drive' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select files' }));
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Poster' }));
    expect(within(screen.getByRole('dialog', { name: 'Poster' })).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
