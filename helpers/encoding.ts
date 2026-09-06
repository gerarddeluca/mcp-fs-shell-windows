// Text-encoding support for the fork's text tools: detection, decode, and
// encode for utf8, utf16le, utf16be, and cp1252.

export type TextEncoding = "utf8" | "utf16le" | "utf16be" | "cp1252";

export const TEXT_ENCODINGS: TextEncoding[] = [
  "utf8",
  "utf16le",
  "utf16be",
  "cp1252",
];

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function startsWithBytes(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Detect the text encoding of a raw buffer:
 *   BOM FF FE    -> utf16le
 *   BOM FE FF    -> utf16be
 *   BOM EF BB BF -> utf8 (the BOM is stripped at decode time)
 *   otherwise, if the buffer decodes as STRICT UTF-8 (no invalid sequences
 *   and no U+FFFD replacement characters) -> utf8
 *   otherwise -> cp1252 (cp1252 accepts any byte value, so it is the fallback)
 */
export function detectEncoding(buf: Buffer): TextEncoding {
  if (startsWithBytes(buf, BOM_UTF16LE)) return "utf16le";
  if (startsWithBytes(buf, BOM_UTF16BE)) return "utf16be";
  if (startsWithBytes(buf, BOM_UTF8)) return "utf8";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    if (text.includes("\uFFFD")) return "cp1252";
    return "utf8";
  } catch {
    return "cp1252";
  }
}

/**
 * Decode a raw buffer with the given encoding, stripping a BOM matching that
 * encoding when present (EF BB BF for utf8, FF FE for utf16le, FE FF for utf16be).
 */
export function decodeText(buf: Buffer, encoding: TextEncoding): string {
  let b = buf;
  if (encoding === "utf8") {
    if (startsWithBytes(b, BOM_UTF8)) b = b.subarray(3);
    return new TextDecoder("utf-8").decode(b);
  }
  if (encoding === "utf16le") {
    if (startsWithBytes(b, BOM_UTF16LE)) b = b.subarray(2);
    return new TextDecoder("utf-16le").decode(b);
  }
  if (encoding === "utf16be") {
    if (startsWithBytes(b, BOM_UTF16BE)) b = b.subarray(2);
    // Decode by swapping byte order to little-endian (drop a trailing odd byte).
    const usable = b.length - (b.length % 2);
    const swapped = Buffer.alloc(usable);
    for (let i = 0; i + 1 < usable; i += 2) {
      swapped[i] = b[i + 1];
      swapped[i + 1] = b[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  // cp1252: accepts any byte value (WHATWG maps the 5 undefined bytes to U+FFFD).
  return new TextDecoder("cp1252").decode(b);
}

// Unicode code points that map into cp1252's 0x80-0x9F range. Everything else
// encodable is an identity mapping: U+0000-U+007F -> 0x00-0x7F and
// U+00A0-U+00FF -> 0xA0-0xFF.
const CP1252_SPECIAL = new Map<number, number>([
  [0x20ac, 0x80], // EURO SIGN
  [0x201a, 0x82], // SINGLE LOW-9 QUOTATION MARK
  [0x0192, 0x83], // LATIN SMALL LETTER F WITH HOOK
  [0x201e, 0x84], // DOUBLE LOW-9 QUOTATION MARK
  [0x2026, 0x85], // HORIZONTAL ELLIPSIS
  [0x2020, 0x86], // DAGGER
  [0x2021, 0x87], // DOUBLE DAGGER
  [0x02c6, 0x88], // MODIFIER LETTER CIRCUMFLEX ACCENT
  [0x2030, 0x89], // PER MILLE SIGN
  [0x0160, 0x8a], // LATIN CAPITAL LETTER S WITH CARON
  [0x2039, 0x8b], // SINGLE LEFT-POINTING ANGLE QUOTATION MARK
  [0x0152, 0x8c], // LATIN CAPITAL LIGATURE OE
  [0x017d, 0x8e], // LATIN CAPITAL LETTER Z WITH CARON
  [0x2018, 0x91], // LEFT SINGLE QUOTATION MARK
  [0x2019, 0x92], // RIGHT SINGLE QUOTATION MARK
  [0x201c, 0x93], // LEFT DOUBLE QUOTATION MARK
  [0x201d, 0x94], // RIGHT DOUBLE QUOTATION MARK
  [0x2022, 0x95], // BULLET
  [0x2013, 0x96], // EN DASH
  [0x2014, 0x97], // EM DASH
  [0x02dc, 0x98], // SMALL TILDE
  [0x2122, 0x99], // TRADE MARK SIGN
  [0x0161, 0x9a], // LATIN SMALL LETTER S WITH CARON
  [0x203a, 0x9b], // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
  [0x0153, 0x9c], // LATIN SMALL LIGATURE OE
  [0x017e, 0x9e], // LATIN SMALL LETTER Z WITH CARON
  [0x0178, 0x9f], // LATIN CAPITAL LETTER Y WITH DIAERESIS
]);

function cp1252CodePointToByte(cp: number): number | null {
  if (cp <= 0x7f) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  return CP1252_SPECIAL.get(cp) ?? null;
}

/**
 * Encode a string to the given encoding. utf16le/utf16be output is prefixed
 * with its BOM (FF FE / FE FF); utf8/cp1252 output is not. Throws for code
 * points with no cp1252 mapping (no silent replacement).
 */
export function encodeText(text: string, encoding: TextEncoding): Buffer {
  if (encoding === "utf8") {
    return Buffer.from(text, "utf-8");
  }
  if (encoding === "utf16le") {
    return Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, "utf-16le"),
    ]);
  }
  if (encoding === "utf16be") {
    const le = Buffer.from(text, "utf-16le");
    const be = Buffer.alloc(le.length);
    for (let i = 0; i + 1 < le.length; i += 2) {
      be[i] = le[i + 1];
      be[i + 1] = le[i];
    }
    return Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
  }
  // cp1252: one byte per code point. text.length (UTF-16 code units) is a safe
  // upper bound on the byte count (surrogate pairs shrink, never grow).
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const byte = cp1252CodePointToByte(cp);
    if (byte === null) {
      throw new Error(
        `Cannot encode character U+${cp.toString(16).toUpperCase()} to cp1252: no mapping`
      );
    }
    out[n++] = byte;
  }
  return out.subarray(0, n);
}
