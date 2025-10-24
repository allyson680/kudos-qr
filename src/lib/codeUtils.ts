// ✅ Canonical: LETTERS + zero-padded number (NO dash). e.g. "NBK0001"
export function normalizeSticker(raw: string, pad = 4) {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // drop spaces/dashes/etc
  const m = s.match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return s; // if format is weird, just return cleaned string
  const [, letters, digits] = m;
  const num = digits.replace(/^0+/, ""); // allow users to skip zeros: NBK1 -> NBK0001
  return letters + num.padStart(pad, "0");
}

// ✅ Derive project from code prefix
export function getProjectFromCode(code: string): "NBK" | "JP" {
  return (code || "").toUpperCase().startsWith("JP") ? "JP" : "NBK";
}

// ✅ Only for reading any OLD dashed docs you might have accidentally created earlier
export function toDashed(code: string) {
  const m = (code || "").match(/^([A-Z]+)([0-9]+)$/);
  return m ? `${m[1]}-${m[2]}` : code;
}

// ✅ Strict validator — only NBK/JP + optional dash + 1–4 digits
export function isValidSticker(raw: string) {
  const t = (raw || "").trim().toUpperCase();
  return /^(?:NBK|JP)-?\d{1,4}$/.test(t);
}

// ✅ Strict normalizer — canonical NBK0001 / JP0042, or null if invalid
export function normalizeStickerStrict(raw: string, pad = 4): string | null {
  const t = (raw || "").trim().toUpperCase();
  const m = t.match(/^(NBK|JP)-?(\d{1,4})$/);
  if (!m) return null;
  const [, letters, digits] = m;
  const unpadded = digits.replace(/^0+/, "") || "0";
  return letters + unpadded.padStart(pad, "0");
}

// ✅ Extractor — safely pull NBK/JP code from text (no scanner required)
export function extractStickerFromText(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();

  // Match NBK123 / JP-45 etc.
  const m = t.match(/\b(?:NBK|JP)-?\d{1,4}\b/i);
  if (m) return normalizeStickerStrict(m[0]);

  // If user pasted the whole code or URL param directly
  return normalizeStickerStrict(t);
}
