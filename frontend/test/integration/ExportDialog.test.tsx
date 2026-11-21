// Exporting selected entries: the dialog's choices reach the file that is saved, and the preview shows it first.
import { readFileSync } from 'node:fs';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcelJS from 'exceljs';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import SectionPage from '../../src/components/SectionPage';
import { setLanguage } from '../../src/language';
import { mockApi, renderWithQuery } from '../helpers';

const saved = vi.hoisted(() => [] as { blob: Blob; name: string }[]);
vi.mock('../../src/download', async (original) => ({
  ...(await original<typeof import('../../src/download')>()),
  saveAs: (blob: Blob, name: string) => saved.push({ blob, name }),
}));

vi.mock('../../src/export/pdfFonts', async (original) => ({
  ...(await original<typeof import('../../src/export/pdfFonts')>()),
  loadPdfFonts: async () => ({
    regular: readFileSync(`${import.meta.dirname}/../../src/export/fonts/Sarabun-Regular.ttf`).toString('base64'),
    bold: readFileSync(`${import.meta.dirname}/../../src/export/fonts/Sarabun-Bold.ttf`).toString('base64'),
  }),
}));

afterEach(() => {
  saved.length = 0;
  setLanguage('en');
});

const projects = [
  { id: 'p1', name: 'Film', name_th: 'ภาพยนตร์', organization: 'Studio X', createdAt: '', updatedAt: '' },
  { id: 'p2', name: 'Game', createdAt: '', updatedAt: '' },
];

describe('cancelling', () => {
  it('stops an export under way, keeping the dialog and its choices, with nothing saved', async () => {
    const image = { id: 'm1', section: 'projects', entryId: 'p1', title: 'Still', description: '', position: '0', fileName: 'still.png', mimeType: 'image/png', size: '10', createdAt: '' };
    const fetch = mockApi({
      '/api/sections/projects': projects,
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/sections/organizations': [],
      '/api/sections/skills': [],
      '/api/sections/domains': [],
      '/api/sections/locations': [],
      '/api/media': [image],
    });
    const base = fetch.getMockImplementation()!;
    // The image never arrives, so the export stays on its first step until cancelled.
    fetch.mockImplementation(async (url: string, init?: RequestInit) => (/\/(file|thumb)/.test(url) ? new Promise<Response>(() => {}) : base(url, init)));
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter>
        <SectionPage section={getSection('projects')!} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Export all 2 projects' }));
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    await user.click(within(dialog).getByRole('button', { name: 'Word .docx' }));
    await user.click(within(dialog).getByRole('button', { name: 'Export Word' }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Export Word' })).not.toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Cancel the export' }));
    expect(within(dialog).getByRole('button', { name: 'Export Word' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Word .docx' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Export' })).toBeInTheDocument();
    expect(saved).toEqual([]);
  });
});

describe('export', () => {
  it('starts on both languages, and exports the selected entries in the one picked', async () => {
    mockApi({
      '/api/sections/projects': projects,
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/skills': [],
      '/api/sections/domains': [],
      '/api/sections/locations': [],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    setLanguage('th');
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter>
        <SectionPage section={getSection('projects')!} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select ภาพยนตร์' }));
    await user.click(screen.getByRole('button', { name: 'Export the 1 selected project' }));
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    // Both, even with the profile shown in Thai.
    expect(within(dialog).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'ไทย' }));
    expect(dialog).toHaveTextContent('1 entry');
    await user.click(within(dialog).getByRole('button', { name: 'Excel .xlsx' }));
    await user.click(within(dialog).getByRole('button', { name: 'Export Excel' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe('Projects.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await saved[0].blob.arrayBuffer());
    expect(book.getWorksheet('Projects')!.getRow(2).values).toEqual([, 'ภาพยนตร์', 'สตูดิโอเอ็กซ์']);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument());
  });
});

describe('preview', () => {
  /** The page's Export (all projects), with the options pane open. */
  async function openExport() {
    mockApi({
      '/api/sections/projects': projects,
      '/api/sections/organizations': [{ id: 'o1', name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }],
      '/api/sections/skills': [],
      '/api/sections/domains': [],
      '/api/sections/locations': [],
      '/api/sections/posts': [],
      '/api/sections/certifications': [],
      '/api/sections/certificates': [],
      '/api/media': [],
    });
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter>
        <SectionPage section={getSection('projects')!} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Export all 2 projects' }));
    return { user, dialog: screen.getByRole('dialog', { name: 'Export' }) };
  }

  it('starts on PDF', async () => {
    const { dialog } = await openExport();
    expect(within(dialog).getByRole('button', { name: 'PDF .pdf' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
  });

  it('shows a Word document laid out like the file, then exports it', async () => {
    const { user, dialog } = await openExport();
    await user.click(within(dialog).getByRole('button', { name: 'Word .docx' }));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const page = await within(dialog).findByRole('article', { name: 'Document preview' });
    // Both languages by default.
    expect(within(page).getByRole('heading', { name: 'Film / ภาพยนตร์' })).toBeInTheDocument();
    expect(within(page).getByRole('heading', { name: 'Game' })).toBeInTheDocument();
    expect(within(page).getByRole('rowheader', { name: 'Organization' }).nextElementSibling).toHaveTextContent('Studio X');
    expect(within(page).getByRole('rowheader', { name: 'Organization (ไทย)' }).nextElementSibling).toHaveTextContent('สตูดิโอเอ็กซ์');
    // The options are out of the way, and Back brings them back.
    expect(within(dialog).queryByRole('button', { name: 'Excel .xlsx' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back to options' }));
    expect(within(dialog).getByRole('button', { name: 'Word .docx' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    await within(dialog).findByRole('article', { name: 'Document preview' });

    await user.click(within(dialog).getByRole('button', { name: 'Export Word' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe('Projects.docx');
  });

  it('shows an Excel workbook as its sheets, with the columns and rows the file gets', async () => {
    const { user, dialog } = await openExport();
    await user.click(within(dialog).getByRole('button', { name: 'Excel .xlsx' }));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const sheet = await within(dialog).findByRole('table', { name: 'Projects sheet' });
    expect(within(sheet).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Project name', 'Organization', 'Organization (ไทย)']);
    expect(within(sheet).getAllByRole('row').slice(1).map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent))).toEqual([
      ['Film / ภาพยนตร์', 'Studio X', 'สตูดิโอเอ็กซ์'],
      ['Game', '', ''],
    ]);
    expect(within(dialog).getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(dialog).getByRole('button', { name: 'Export Excel' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await saved[0].blob.arrayBuffer());
    expect(book.getWorksheet('Projects')!.getRow(1).values).toEqual([, 'Project name', 'Organization', 'Organization (ไทย)']);
    expect(book.getWorksheet('Projects')!.getRow(2).values).toEqual([, 'Film / ภาพยนตร์', 'Studio X', 'สตูดิโอเอ็กซ์']);
  });

  it('shows the PDF itself, and exports the very file it showed', async () => {
    const { user, dialog } = await openExport();
    await user.click(within(dialog).getByRole('button', { name: 'PDF .pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const frame = await within(dialog).findByTitle('Preview of Projects.pdf', {}, { timeout: 20_000 });
    expect(frame).toHaveAttribute('src', 'blob:preview');

    await user.click(within(dialog).getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe('Projects.pdf');
    expect(new TextDecoder().decode((await saved[0].blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
  }, 30_000);

  it("falls back to the layout where the browser can't show a PDF inside a page", async () => {
    vi.stubGlobal('navigator', { ...navigator, pdfViewerEnabled: false });
    const { user, dialog } = await openExport();
    await user.click(within(dialog).getByRole('button', { name: 'PDF .pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    expect(await within(dialog).findByText(/This browser can't show the PDF here/, {}, { timeout: 20_000 })).toBeInTheDocument();
    expect(within(dialog).getByRole('article', { name: 'Document preview' })).toHaveTextContent('Studio X');
  }, 30_000);
});
