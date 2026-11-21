// The Word, Excel and PDF files: valid, with the entries' text (Thai too) and their images.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { unzipSync, unzlibSync, strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { getSection } from '@profile/shared';
import type { ExportImage } from '../../src/export/images';
import type { ExportDoc } from '../../src/export/model';

vi.mock('../../src/export/pdfFonts', async (original) => ({
  ...(await original<typeof import('../../src/export/pdfFonts')>()),
  loadPdfFonts: async () => ({
    regular: readFileSync(`${import.meta.dirname}/../../src/export/fonts/Sarabun-Regular.ttf`).toString('base64'),
    bold: readFileSync(`${import.meta.dirname}/../../src/export/fonts/Sarabun-Bold.ttf`).toString('base64'),
  }),
}));

// A 1×1 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const images = new Map<string, ExportImage>([['m1', { data: PNG, type: 'png', width: 1, height: 1 }]]);
const doc: ExportDoc = {
  title: 'Projects',
  languages: ['en', 'th'],
  date: '2 October 2026',
  sections: [
    {
      section: getSection('projects')!,
      entries: [
        {
          id: 'p1',
          titles: ['Film', 'ภาพยนตร์'],
          draft: false,
          fields: [
            { key: 'description', label: 'Description', text: 'A short film\nabout robots', long: true },
            { key: 'description:th', label: 'Description (ไทย)', text: 'หนังสั้นเกี่ยวกับหุ่นยนต์', long: true },
          ],
          files: [
            { item: { id: 'm1', title: 'Poster', description: 'The poster', fileName: 'Project_Poster_Me.png', mimeType: 'image/png' } as never, descriptions: ['The poster', 'โปสเตอร์หนัง'], kind: 'image', group: '', path: 'media/Film/Project_Poster_Me.png' },
            { item: { id: 'm2', title: 'Trailer', description: '', fileName: 'Project_Trailer_Me.mp4', mimeType: 'video/mp4' } as never, descriptions: [], kind: 'video', group: '' },
          ],
        },
      ],
    },
  ],
};

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('export writers', () => {
  it('writes a Word document with the text and the image', async () => {
    const { writeDocx } = await import('../../src/export/docx');
    const files = unzipSync(await bytes(await writeDocx(doc, images)));
    const xml = strFromU8(files['word/document.xml']);
    for (const text of ['Film / ภาพยนตร์', 'Description (ไทย)', 'หนังสั้นเกี่ยวกับหุ่นยนต์', 'about robots', 'The poster', 'โปสเตอร์หนัง', 'Trailer', 'Video · Project_Trailer_Me.mp4', 'Image · media/Film/Project_Poster_Me.png']) {
      expect(xml).toContain(text);
    }
    expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(true);
    // The image's paragraph is centred.
    const imageParagraph = xml.split('</w:p>').find((p) => p.includes('<w:drawing>'));
    expect(imageParagraph).toContain('<w:jc w:val="center"/>');
  });

  it('writes a workbook: a row per entry, and a Media sheet linking the files', async () => {
    const { writeXlsx } = await import('../../src/export/xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await bytes(await writeXlsx(doc, images))).buffer as ArrayBuffer);
    const sheet = book.getWorksheet('Projects')!;
    expect(sheet.getRow(1).values).toEqual([, 'Project name', 'Description', 'Description (ไทย)', 'Media files']);
    expect(sheet.getRow(2).values).toEqual([, 'Film / ภาพยนตร์', 'A short film\nabout robots', 'หนังสั้นเกี่ยวกับหุ่นยนต์', 2]);
    const media = book.getWorksheet('Media')!;
    expect(media.getRow(2).getCell('F').value).toBe('The poster\n\nโปสเตอร์หนัง');
    expect(media.getRow(2).getCell('G').value).toEqual({ text: 'media/Film/Project_Poster_Me.png', hyperlink: 'media/Film/Project_Poster_Me.png' });
    expect(media.getImages()).toHaveLength(1);
  });

  it('writes a PDF in the Thai font', async () => {
    const { writePdf } = await import('../../src/export/pdf');
    const pdf = await bytes(await writePdf(doc, images));
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Sarabun/);
    expect(text).toContain('/Subtype /Image');
  }, 30_000);

  it('centres images on the PDF page', async () => {
    const { writePdf } = await import('../../src/export/pdf');
    const pdf = await bytes(await writePdf(doc, images));
    // Page content is deflated; an image is drawn as "w 0 0 -h x y cm /Img Do".
    const raw = new TextDecoder('latin1').decode(pdf);
    const content = [...raw.matchAll(/stream\r?\n/g)]
      .map((m) => {
        const start = m.index! + m[0].length;
        try {
          return strFromU8(unzlibSync(pdf.subarray(start, raw.indexOf('endstream', start))), true);
        } catch {
          return '';
        }
      })
      .join('\n');
    const draw = content.match(/([\d.]+) 0 0 -?[\d.]+ ([\d.]+) [\d.]+ cm\s*\/\S+ Do/);
    expect(draw).not.toBeNull();
    // The 1-point test image on an A4 line (595.28 points less two 48-point margins): centred near 297, not at 48.
    const [, width, x] = draw!.map(Number);
    expect(width).toBe(1);
    expect(x).toBeCloseTo(297, 0);
  }, 30_000);
});
