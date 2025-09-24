import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env if present

// usage: node tools/make-qrs.mjs inputs/codes.txt [outDir]
// output defaults to exports/qrs
const INPUT = process.argv[2] || "inputs/codes.txt";
const OUT_DIR = process.argv[3] || "exports/qrs";

// base URL for your app
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

if (!fs.existsSync(INPUT)) {
  console.error("❌ Input file not found:", INPUT);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const lines = fs.readFileSync(INPUT, "utf-8")
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

(async () => {
  console.log("Base URL:", BASE_URL);
  console.log("Input:", INPUT);
  console.log("Out:", OUT_DIR);

  for (const code of lines) {
    const url = `${BASE_URL}/k/${encodeURIComponent(code)}`;
    const outPath = path.join(OUT_DIR, `${code}.png`);

    await QRCode.toFile(outPath, url, {
      width: 600,           // nice & crisp
      margin: 1,            // small quiet zone
      errorCorrectionLevel: "M",
    });

    console.log("✅", outPath);
  }

  console.log("All done 🎉  (Scan one of the PNGs to test.)");
})();
