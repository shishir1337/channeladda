import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pngToPdf } from "@/lib/png-to-pdf";

// The deal certificate is drawn as a PNG; buyers asked for a file to keep,
// and a PDF is what a support desk or a lawyer expects to be sent.

/** A PNG from raw rows, each row already carrying its filter byte. */
function png(
  width: number,
  height: number,
  colorType: 2 | 6,
  rows: number[][],
): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const idat = deflateSync(Uint8Array.from(rows.flat()));
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array()),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const text = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** The image's pixels, read back out of the PDF. */
function pixels(pdf: Uint8Array): number[] {
  const s = text(pdf);
  const start = s.indexOf("stream\n", s.indexOf("/Subtype /Image")) + 7;
  const length = Number(
    /\/Subtype \/Image[^>]*\/Length (\d+)/.exec(s)?.[1] ?? Number.NaN,
  );
  return [...inflateSync(Buffer.from(pdf.subarray(start, start + length)))];
}

describe("pngToPdf", () => {
  it("makes a one-page PDF whose cross-reference points at every object", () => {
    const pdf = pngToPdf(
      png(1, 1, 2, [[0, 255, 0, 0]]),
      { widthPt: 842, heightPt: 595 },
      "Certificate",
    );
    const s = text(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/MediaBox [0 0 842 595]");
    expect(s).toContain("/Title (Certificate)");

    const xrefAt = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n/gm)].map(
      (m) => Number(m[1]),
    );
    expect(offsets.length).toBeGreaterThan(3);
    offsets.forEach((offset, i) => {
      expect(
        s.startsWith(
          `${i + 1} 0 obj
`,
          offset,
        ),
      ).toBe(true);
    });
  });

  it("undoes every PNG row filter", () => {
    // Red, green, blue in each row. The first row is written with Sub (each
    // byte minus the one to its left), the next two with Up and Paeth, which
    // here both mean "the same as the row above".
    const pdf = pngToPdf(
      png(3, 3, 2, [
        [1, 255, 0, 0, 1, 255, 0, 0, 1, 255],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]),
      { widthPt: 3, heightPt: 3 },
    );
    const row = [255, 0, 0, 0, 255, 0, 0, 0, 255];
    expect(pixels(pdf)).toEqual([...row, ...row, ...row]);
  });

  it("lays a see-through pixel over white paper", () => {
    const pdf = pngToPdf(png(1, 1, 6, [[0, 255, 0, 0, 128]]), {
      widthPt: 1,
      heightPt: 1,
    });
    expect(pixels(pdf)).toEqual([255, 127, 127]);
  });

  it("refuses something that is not a PNG", () => {
    expect(() =>
      pngToPdf(new Uint8Array([1, 2, 3]), { widthPt: 1, heightPt: 1 }),
    ).toThrow(/PNG/);
  });
});
