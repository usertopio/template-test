// The PDF export's font: Sarabun (Thai and Latin), with an empty glyph for the zero width space that breaks
// Thai lines between words (see scripts/add-zwsp-glyph.py). Fetched only when a PDF is made.
import boldUrl from './fonts/Sarabun-Bold.ttf?url';
import regularUrl from './fonts/Sarabun-Regular.ttf?url';

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const load = async (url: string) => base64(new Uint8Array(await (await fetch(url)).arrayBuffer()));

/** The font files, base64-encoded for pdfmake's virtual file system. */
export async function loadPdfFonts(): Promise<{ regular: string; bold: string }> {
  const [regular, bold] = await Promise.all([load(regularUrl), load(boldUrl)]);
  return { regular, bold };
}

export { base64 };
