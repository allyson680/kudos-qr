// Canonical: LETTERS + zero-padded number (NO dash). e.g. "NBK0001"
export function normalizeSticker(raw: string, pad = 4) {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // drop spaces/dashes/etc
  const m = s.match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return s;               // if format is weird, just return cleaned string
  const [, letters, digits] = m;
  const num = digits.replace(/^0+/, ""); // allow users to skip zeros: NBK1 -> NBK0001
  return letters + num.padStart(pad, "0");
}

// Derive project from code prefix
export function getProjectFromCode(code: string): "NBK" | "JP" {
  return code.startsWith("JP") ? "JP" : "NBK";
}

// Only for reading any OLD dashed docs you might have accidentally created earlier
export function toDashed(code: string) {
  const m = code.match(/^([A-Z]+)([0-9]+)$/);
  return m ? `${m[1]}-${m[2]}` : code;
}
