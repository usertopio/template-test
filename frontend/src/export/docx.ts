// Word export: a heading per section and entry, a table of its fields, then its media (images embedded).
import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { fit, type ExportImage } from './images';
import { fileNote, sectionHeading, type Writer } from './layout';

/** Text with its line breaks kept. */
const lines = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0, ...options }));

// Calibri for English and Leelawadee UI for Thai, which Word on Windows and Office for Mac both have
// (Thai is a "complex script" in Word, so it takes the cs font).
const FONT = { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Leelawadee UI', eastAsia: 'Calibri' };
const HEADING = (size: number, before: number) => ({ run: { font: FONT, size, bold: true, color: '1F2937' }, paragraph: { spacing: { before, after: 80 } } });

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const ROW_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' };

/** An image's width on the page: up to about 16 cm (in pixels at 96 dpi), and not too tall. */
const imageRun = (image: ExportImage) => new ImageRun({ type: image.type, data: image.data, transformation: fit(image, 600, 520) });

export const writeDocx: Writer = async (doc, images) => {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ children: [new TextRun({ text: doc.date, color: '666666' })] }),
  ];

  for (const { section, entries } of doc.sections) {
    if (doc.sections.length > 1) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(sectionHeading(section, doc.languages))] }));
    for (const entry of entries) {
      children.push(
        new Paragraph({
          heading: doc.sections.length > 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
          spacing: { before: 360 },
          children: [new TextRun(entry.titles.join(' / ')), ...(entry.draft ? [new TextRun({ text: '  (draft)', color: '996600' })] : [])],
        }),
      );
      if (entry.fields.length) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 50, bottom: 50, left: 60, right: 60 },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideVertical: NO_BORDER, insideHorizontal: ROW_BORDER },
            rows: entry.fields.map(
              (f) =>
                new TableRow({
                  children: [
                    new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: lines(f.label, { color: '555555' }) })] }),
                    new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: lines(f.text) })] }),
                  ],
                }),
            ),
          }),
        );
      }
      if (entry.files.length) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240 }, children: [new TextRun('Media')] }));
        for (const file of entry.files) {
          const image = images.get(file.item.id);
          if (image) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160 }, children: [imageRun(image)] }));
          children.push(new Paragraph({ spacing: { before: image ? 60 : 160 }, children: lines(file.item.title, { bold: true }) }));
          for (const description of file.descriptions) children.push(new Paragraph({ children: lines(description) }));
          children.push(new Paragraph({ children: [new TextRun({ text: fileNote(file), size: 18, color: '777777' })] }));
        }
      }
    }
  }

  return Packer.toBlob(
    new Document({
      creator: 'Parzival Profile',
      title: doc.title,
      styles: {
        default: {
          document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 276 } } },
          title: { run: { font: FONT, size: 44, bold: true, color: '111827' } },
          heading1: HEADING(32, 360),
          heading2: HEADING(26, 280),
          heading3: HEADING(22, 200),
        },
      },
      sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }],
    }),
  );
};
