import { useEffect, useState } from 'react';
import type { ExportImage } from '../export/images';
import { MEDIA_COLUMNS, fileNote, mediaRows, sectionHeading, sheetColumns, sheetName, sheetRow } from '../export/layout';
import type { ExportDoc } from '../export/model';
import type { PreparedExport } from '../export/run';

// What an export will look like, before it is saved. A PDF is the real file; Word and Excel files can't be shown
// in a browser, so they are drawn here from the same content their writers lay out.

/** Object URLs for the embedded images, by media id, released when the preview closes. */
function useImageUrls(images: Map<string, ExportImage>) {
  const [urls, setUrls] = useState(() => new Map<string, string>());
  useEffect(() => {
    const made = new Map([...images].map(([id, image]) => [id, URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.type === 'png' ? 'image/png' : 'image/jpeg' }))]));
    setUrls(made);
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);
  return urls;
}

export default function ExportPreview({ prepared }: { prepared: PreparedExport }) {
  const { format } = prepared.options;
  if (format === 'pdf') return <PdfPreview prepared={prepared} />;
  if (format === 'xlsx') return <SheetsPreview doc={prepared.doc} images={prepared.images} />;
  return <PagePreview doc={prepared.doc} images={prepared.images} />;
}

/** The PDF itself, in the browser's own viewer; a phone without one gets the layout drawn instead. */
function PdfPreview({ prepared }: { prepared: PreparedExport }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!prepared.blob) return;
    const made = URL.createObjectURL(prepared.blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [prepared.blob]);
  // Most phone browsers can't show a PDF inside a page (and say so here).
  if (typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === false) {
    return (
      <>
        <p className="text-xs text-slate-500 dark:text-slate-400">This browser can't show the PDF here, so this is its layout. Export to open the file itself.</p>
        <PagePreview doc={prepared.doc} images={prepared.images} />
      </>
    );
  }
  return url ? <iframe src={url} title={`Preview of ${prepared.title}.pdf`} className="h-[65dvh] w-full rounded-md border border-slate-200 bg-white dark:border-slate-700" /> : null;
}

/** The Word document: a white page with its headings, field tables and images, as the writer lays them out. */
function PagePreview({ doc, images }: { doc: ExportDoc; images: Map<string, ExportImage> }) {
  const urls = useImageUrls(images);
  const several = doc.sections.length > 1;
  // A page is paper in either theme.
  return (
    <article aria-label="Document preview" className="rounded-md bg-white px-6 py-7 text-[13px] leading-relaxed text-slate-900 shadow-sm ring-1 ring-slate-200 sm:px-10 dark:ring-slate-700">
      <h1 className="text-2xl font-bold text-slate-950">{doc.title}</h1>
      <p className="text-slate-500">{doc.date}</p>
      {doc.sections.map(({ section, entries }) => (
        <section key={section.key}>
          {several && <h2 className="mt-6 text-lg font-bold text-slate-800">{sectionHeading(section, doc.languages)}</h2>}
          {entries.map((entry) => (
            <div key={entry.id}>
              <h3 className={`mt-6 mb-1 font-bold text-slate-800 ${several ? 'text-base' : 'text-lg'}`}>
                {entry.titles.join(' / ')}
                {entry.draft && <span className="font-normal text-amber-700"> (draft)</span>}
              </h3>
              {entry.fields.length > 0 && (
                <table className="w-full border-collapse">
                  <tbody>
                    {entry.fields.map((f) => (
                      <tr key={f.key} className="border-b border-slate-200 last:border-0">
                        <th scope="row" className="w-[28%] py-1 pr-2 text-left align-top font-normal whitespace-pre-line text-slate-500">
                          {f.label}
                        </th>
                        <td className="py-1 align-top whitespace-pre-line">{f.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {entry.files.length > 0 && (
                <>
                  <h4 className="mt-4 font-bold text-slate-800">Media</h4>
                  {entry.files.map((file) => (
                    <figure key={file.item.id} className="mt-3">
                      {urls.get(file.item.id) && <img src={urls.get(file.item.id)} alt={file.item.title} className="mx-auto max-h-72 max-w-full" />}
                      <figcaption>
                        <span className="block font-bold whitespace-pre-line">{file.item.title}</span>
                        {file.descriptions.map((description) => (
                          <span key={description} className="block whitespace-pre-line">
                            {description}
                          </span>
                        ))}
                        <span className="block text-xs break-all text-slate-500">{fileNote(file)}</span>
                      </figcaption>
                    </figure>
                  ))}
                </>
              )}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

/** The Excel workbook: a tab per sheet, each a grid with the blue header row the writer gives it. */
function SheetsPreview({ doc, images }: { doc: ExportDoc; images: Map<string, ExportImage> }) {
  const urls = useImageUrls(images);
  const taken = new Set<string>();
  const sheets = doc.sections.map(({ section, entries }) => ({
    name: sheetName(section.label, taken),
    columns: sheetColumns(section, entries),
    rows: entries.map((e) => ({ id: e.id, cells: sheetRow(e) as Record<string, string | number> })),
  }));
  const media = mediaRows(doc);
  if (media.length) {
    sheets.push({
      name: sheetName('Media', taken),
      columns: MEDIA_COLUMNS,
      rows: media.map(({ file, ...cells }) => ({ id: file.item.id, cells: { ...cells, file: file.path ?? file.item.fileName, preview: file.item.id } })),
    });
  }
  const [open, setOpen] = useState(0);
  const sheet = sheets[Math.min(open, sheets.length - 1)];

  return (
    <div className="overflow-hidden rounded-md bg-white text-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="max-h-[55dvh] overflow-auto">
        <table aria-label={`${sheet.name} sheet`} className="border-collapse text-xs">
          <thead className="sticky top-0">
            <tr>
              {sheet.columns.map((c) => (
                // Excel measures a column in characters; about 7px each.
                <th key={c.key} style={{ minWidth: Math.min(c.width, 40) * 7 }} className="border border-blue-800 bg-blue-700 px-2 py-1 text-left font-bold text-white">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.id}>
                {sheet.columns.map((c) => (
                  <td key={c.key} className="border border-slate-200 px-2 py-1 align-top whitespace-pre-line">
                    {c.key === 'preview' ? urls.get(String(row.cells.preview)) && <img src={urls.get(String(row.cells.preview))} alt="" className="max-h-20 max-w-20" /> : row.cells[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Sheet tabs along the bottom, as in Excel. */}
      <div role="tablist" aria-label="Sheets" className="flex gap-px overflow-x-auto border-t border-slate-200 bg-slate-100 text-xs">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={s === sheet}
            onClick={() => setOpen(i)}
            className={`shrink-0 px-3 py-1.5 ${s === sheet ? 'bg-white font-medium text-blue-800' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
