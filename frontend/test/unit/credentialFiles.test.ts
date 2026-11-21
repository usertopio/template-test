import { afterEach, describe, expect, it, vi } from 'vitest';
import { credentialFormats, imagePdf, jpegInfo } from '../../src/credentialFiles';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/** A JPEG with just the markers jpegInfo reads: an optional Exif orientation, then a frame header. */
function jpeg({ width = 1600, height = 1200, components = 3, orientation }: { width?: number; height?: number; components?: number; orientation?: number } = {}) {
  const exif =
    orientation === undefined
      ? []
      : // APP1 "Exif\0\0", big-endian TIFF header, one directory entry: orientation (0x0112), SHORT, 1 value.
        [0xff, 0xe1, 0x00, 0x22, ...'Exif\0\0'.split('').map((c) => c.charCodeAt(0)), 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, components, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...exif, ...sof, 0xff, 0xd9]);
}

describe('imagePdf', () => {
  const bytes = jpeg();
  const pdf = text(imagePdf({ data: bytes, width: 1600, height: 1200, colorSpace: 'DeviceRGB', filter: 'DCTDecode' }));

  it('is a one-page PDF holding the image as it is', () => {
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain(`/Width 1600 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length}`);
    expect(pdf).toContain(`stream\n${text(bytes)}\nendstream`);
  });

  it('sizes the page to the image, A4 on its longer side', () => {
    expect(pdf).toContain('/MediaBox [0 0 842 631.5]');
    expect(pdf).toContain('q 842 0 0 631.5 0 0 cm /Im0 Do Q');
  });

  // A reader finds each object by the byte offsets in the table, so a wrong one makes the file unreadable.
  it('points its cross-reference table at each object', () => {
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((at, i) => expect(pdf.slice(at).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(startxref).startsWith('xref\n0 6\n')).toBe(true);
  });
});

describe('jpegInfo', () => {
  it('reads the size and color components from the frame header', () => {
    expect(jpegInfo(jpeg({ width: 2480, height: 3508, components: 1 }))).toEqual({ width: 2480, height: 3508, components: 1, turned: false });
  });

  it('says when the Exif orientation turns the photo', () => {
    expect(jpegInfo(jpeg({ orientation: 6 }))!.turned).toBe(true);
    expect(jpegInfo(jpeg({ orientation: 1 }))!.turned).toBe(false);
  });

  it("gives nothing for a file that isn't a JPEG", () => {
    expect(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
  });
});

describe('credentialFormats', () => {
  // jsdom can't decode or draw images: a 2×1 image of a red and a blue pixel stands in for the uploaded one.
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  const qualities: Record<string, unknown> = {};
  function fakeCanvas() {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 1, close() {} })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: pixels }) } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type, quality) => {
      qualities[type!] = quality;
      done(new Blob([type!], { type }));
    });
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('leaves a file of another type alone', async () => {
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect(await credentialFormats(file)).toEqual([file]);
  });

  it('makes the JPG at its highest quality', async () => {
    fakeCanvas();
    await credentialFormats(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'cert.png', { type: 'image/png' }));
    expect(qualities['image/jpeg']).toBe(1);
  });

  it("puts an uploaded JPG into the PDF byte for byte, so it isn't compressed again", async () => {
    fakeCanvas();
    const bytes = jpeg({ width: 2, height: 1 });
    const [png, jpg, pdf] = await credentialFormats(new File([bytes], 'cert.jpg', { type: 'image/jpeg' }));
    expect([png.name, jpg.name, pdf.name]).toEqual(['cert.png', 'cert.jpg', 'cert.pdf']);
    const body = text(new Uint8Array(await pdf.arrayBuffer()));
    expect(body).toContain('/Filter /DCTDecode');
    expect(body).toContain(`stream\n${text(bytes)}\nendstream`);
  });

  it('puts a turned JPG into the PDF as its pixels, the way it shows', async () => {
    fakeCanvas();
    const [, , pdf] = await credentialFormats(new File([jpeg({ width: 1, height: 2, orientation: 6 })], 'cert.jpg', { type: 'image/jpeg' }));
    expect(text(new Uint8Array(await pdf.arrayBuffer()))).toContain('/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode');
  });

  it('puts an uploaded PNG into the PDF as its exact pixels, compressed without loss', async () => {
    fakeCanvas();
    const [, , pdf] = await credentialFormats(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'cert.png', { type: 'image/png' }));
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const body = text(bytes);
    expect(body).toContain('/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode');
    const start = body.indexOf('stream\n') + 'stream\n'.length;
    const length = Number(/\/FlateDecode \/Length (\d+)/.exec(body)![1]);
    const inflated = await new Response(new Response(bytes.slice(start, start + length)).body!.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    expect([...new Uint8Array(inflated)]).toEqual([255, 0, 0, 0, 0, 255]);
  });
});
