// Excel export: a sheet per section (a row per entry, a column per field), and a Media sheet listing every
// file with a small preview of images and, when the files are included, a link to the file in the zip.
import ExcelJS from 'exceljs';
import { fit } from './images';
import { MEDIA_COLUMNS, mediaRows, sheetColumns, sheetName, sheetRow, type Writer } from './layout';

const HEADER = { bold: true, color: { argb: 'FFFFFFFF' } };
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
const PREVIEW_PX = 80;

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = HEADER;
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export const writeXlsx: Writer = async (doc, images) => {
  const book = new ExcelJS.Workbook();
  book.creator = 'Parzival Profile';
  book.title = doc.title;
  const taken = new Set<string>();

  for (const { section, entries } of doc.sections) {
    const sheet = book.addWorksheet(sheetName(section.label, taken));
    sheet.columns = sheetColumns(section, entries);
    for (const e of entries) {
      const row = sheet.addRow(sheetRow(e));
      row.alignment = { vertical: 'top', wrapText: true };
    }
    styleHeader(sheet);
  }

  const files = mediaRows(doc);
  if (files.length) {
    const sheet = book.addWorksheet(sheetName('Media', taken));
    sheet.columns = MEDIA_COLUMNS;
    for (const { file, ...cells } of files) {
      const row = sheet.addRow({
        ...cells,
        // A link that opens the file next to the workbook once the zip is unpacked.
        file: file.path ? { text: file.path, hyperlink: file.path } : file.item.fileName,
      });
      row.alignment = { vertical: 'top', wrapText: true };
      if (file.path) row.getCell('file').font = { color: { argb: 'FF1D4ED8' }, underline: true };
      const image = images.get(file.item.id);
      if (image) {
        row.height = PREVIEW_PX * 0.75 + 6; // points
        const id = book.addImage({ buffer: image.data as unknown as ExcelJS.Buffer, extension: image.type === 'png' ? 'png' : 'jpeg' });
        sheet.addImage(id, { tl: { col: 0.05, row: row.number - 1 + 0.05 }, ext: fit(image, PREVIEW_PX, PREVIEW_PX) });
      }
    }
    styleHeader(sheet);
  }

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
