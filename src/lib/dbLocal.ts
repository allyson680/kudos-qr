import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const WORKERS_PATH = path.join(DATA_DIR, "workers.json");
const COMPANIES_PATH = path.join(DATA_DIR, "companies.json");

// ensure files exist
function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORKERS_PATH)) fs.writeFileSync(WORKERS_PATH, "[]", "utf-8");
  if (!fs.existsSync(COMPANIES_PATH)) fs.writeFileSync(COMPANIES_PATH, "[]", "utf-8");
}

export function readCompanies() {
  ensureFiles();
  const raw = fs.readFileSync(COMPANIES_PATH, "utf-8");
  return JSON.parse(raw) as Array<{id:string; name:string}>;
}

export function readWorkers() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(WORKERS_PATH, "utf-8"));
}

export function upsertWorker(worker: {
  code: string;
  project: "NBK" | "JP";
  fullName: string;
  companyId: string;
}) {
  ensureFiles();
  const list = readWorkers() as any[];
  const idx = list.findIndex(w => w.code === worker.code);
  if (idx >= 0) list[idx] = { ...list[idx], ...worker };
  else list.push({ ...worker, createdAt: new Date().toISOString() });
  fs.writeFileSync(WORKERS_PATH, JSON.stringify(list, null, 2), "utf-8");
  return worker;
}

export function getWorkerByCode(code: string) {
  const list = readWorkers() as any[];
  return list.find(w => w.code === code) || null;
}
