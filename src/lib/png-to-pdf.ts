import { deflateSync, inflateSync } from "node:zlib";

/**
 * A one-page PDF holding a PNG, laid on white paper.
 *
 * The deal certificate is drawn as a PNG (`next/og`), and people asked for a
 * file to keep and send on; a PDF is what a support desk or a lawyer expects.
 * Written by hand rather than with a PDF library: a page with one picture on
 * it is six objects, and the PNG's own compressed pixels are reused.
 *
 * Takes 8-bit, non-interlaced RGB or RGBA, which is what `next/og` makes.
 */
export function pngToPdf(
  png: Uint8Array,
  page: { widthPt: number; heightPt: number },
  title?: string,
  /**
   * What the picture says, laid over it as invisible text in a standard
   * font (nothing embedded), so the PDF can be searched and copied from.
   * An image-only certificate could not be: QA, 2026-10-26.
   */
  text: readonly string[] = [],
): Uint8Array<ArrayBuffer> {
  const image = decodePng(png);
  const pixels = deflateSync(image.rgb);

  const objects: (string | Uint8Array)[][] = [];
  const add = (...parts: (string | Uint8Array)[]) => {
    objects.push(parts);
    return objects.length;
  };

  const { widthPt: w, heightPt: h } = page;
  // Render mode 3 draws nothing: the text is there to select and search,
  // and the picture is what shows.
  const words =
    text.length > 0
      ? `\nBT /F1 9 Tf 3 Tr 11 TL 36 ${h - 36} Td ${text
          .map((line) => `(${escapePdfText(line)}) Tj T*`)
          .join(" ")} ET`
      : "";
  const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q${words}`;
  const font = text.length > 0 ? " /Font << /F1 6 0 R >>" : "";
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >>${font} >> /Contents 4 0 R >>`,
  );
  add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  add(
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`,
    pixels,
    "\nendstream",
  );
  if (text.length > 0) {
    add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
  }
  add(`<< /Title (${escapePdfText(title ?? "")}) /Producer (Channel Adda) >>`);

  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const offsets: number[] = [];
  objects.forEach((parts, index) => {
    offsets.push(length);
    push(`${index + 1} 0 obj\n`);
    for (const part of parts) push(part);
    push("\nendobj\n");
  });

  const xrefAt = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Brackets and backslashes escaped; anything outside Latin-1 dropped. */
function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "")
    .replace(/[\\()]/g, (c) => `\\${c}`);
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The PNG's pixels as RGB, any transparency laid over white. */
function decodePng(png: Uint8Array): {
  width: number;
  height: number;
  rgb: Uint8Array;
} {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte)) {
    throw new Error("Not a PNG file.");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];

  for (let at = 8; at + 8 <= png.length; ) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + size);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(
          "Only 8-bit, non-interlaced RGB or RGBA PNG is supported.",
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + size;
  }
  if (!width || !height || idat.length === 0) {
    throw new Error("That PNG file is incomplete.");
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = above ? above[x] : 0;
      const c = above && x >= channels ? above[x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = (line[x] + predicted) & 0xff;
    }
  }

  if (channels === 3) return { width, height, rgb: rows };
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rows.length; i += 4, j += 3) {
    const alpha = rows[i + 3];
    for (let k = 0; k < 3; k++) {
      rgb[j + k] = Math.round(
        (rows[i + k] * alpha + 255 * (255 - alpha)) / 255,
      );
    }
  }
  return { width, height, rgb };
}
