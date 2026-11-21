// PDF export: the same layout as Word, in Sarabun so Thai shows (and wraps between words, not inside them).
import pdfMake from 'pdfmake/build/pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { fit } from './images';
import { fileNote, sectionHeading, type Writer } from './layout';
import { base64, loadPdfFonts } from './pdfFonts';

const THAI = /[฀-๿]/;
const segmenter = typeof Intl.Segmenter === 'undefined' ? null : new Intl.Segmenter('th', { granularity: 'word' });

/**
 * Thai is written without spaces between words, so a PDF would only break its lines inside words.
 * A zero width space between the words lets lines break there instead.
 */
export function wrapThai(text: string): string {
  if (!segmenter || !THAI.test(text)) return text;
  return [...segmenter.segment(text)].map((s) => s.segment).join('​');
}

let fontsReady: Promise<void> | null = null;
function useSarabun() {
  fontsReady ??= loadPdfFonts().then(({ regular, bold }) => {
    pdfMake.addVirtualFileSystem({ 'Sarabun-Regular.ttf': regular, 'Sarabun-Bold.ttf': bold });
    pdfMake.addFonts({ Sarabun: { normal: 'Sarabun-Regular.ttf', bold: 'Sarabun-Bold.ttf', italics: 'Sarabun-Regular.ttf', bolditalics: 'Sarabun-Bold.ttf' } });
  });
  return fontsReady.catch((err) => {
    fontsReady = null; // try again next time
    throw err;
  });
}

/** A4 width less the margins, in points. */
const CONTENT_WIDTH = 595 - 2 * 48;

export const writePdf: Writer = async (doc, images) => {
  await useSarabun();
  const several = doc.sections.length > 1;
  const content: Content[] = [
    { text: wrapThai(doc.title), style: 'title' },
    { text: doc.date, style: 'muted', margin: [0, 0, 0, 12] },
  ];

  for (const { section, entries } of doc.sections) {
    if (several) content.push({ text: sectionHeading(section, doc.languages), style: 'section' });
    for (const entry of entries) {
      content.push({
        text: [wrapThai(entry.titles.join(' / ')), ...(entry.draft ? [{ text: '  (draft)', style: 'draft' }] : [])],
        style: several ? 'entry' : 'section',
      });
      if (entry.fields.length) {
        content.push({
          layout: 'lightHorizontalLines',
          table: {
            widths: [130, '*'],
            body: entry.fields.map((f) => [
              { text: wrapThai(f.label), style: 'label' },
              { text: wrapThai(f.text) },
            ]),
          },
        });
      }
      if (entry.files.length) {
        content.push({ text: 'Media', style: 'media' });
        for (const file of entry.files) {
          const image = images.get(file.item.id);
          const block: Content[] = [];
          if (image) {
            const size = fit(image, CONTENT_WIDTH, 360);
            block.push({ image: `data:image/${image.type === 'png' ? 'png' : 'jpeg'};base64,${base64(image.data)}`, ...size, alignment: 'center', margin: [0, 6, 0, 2] });
          }
          block.push({ text: wrapThai(file.item.title), bold: true, margin: [0, image ? 0 : 6, 0, 0] });
          for (const description of file.descriptions) block.push({ text: wrapThai(description) });
          block.push({ text: wrapThai(fileNote(file)), style: 'muted' });
          // Keep an image with its caption.
          content.push({ stack: block, unbreakable: true });
        }
      }
    }
  }

  const definition: TDocumentDefinitions = {
    info: { title: doc.title, creator: 'Parzival Profile' },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: 'Sarabun', fontSize: 10.5, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 22, bold: true },
      section: { fontSize: 16, bold: true, margin: [0, 16, 0, 6] },
      entry: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
      media: { fontSize: 11, bold: true, margin: [0, 10, 0, 0] },
      label: { color: '#555555' },
      muted: { fontSize: 9, color: '#777777' },
      draft: { fontSize: 10, bold: false, color: '#996600' },
    },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: '#999999', margin: [48, 16] }),
    content,
  };
  return pdfMake.createPdf(definition).getBlob();
};
