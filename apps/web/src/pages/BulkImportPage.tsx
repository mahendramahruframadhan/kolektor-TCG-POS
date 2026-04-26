import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { MobileAppBar } from "../components/MobileAppBar.js";
// `xlsx` is ~2 MB; dynamic-import it inside the two handlers that actually
// need it so the main PWA bundle stays lean. See docs/reviews/code/2026-04-24-merged.md L8.
type XlsxModule = typeof import("xlsx");
let xlsxPromise: Promise<XlsxModule> | null = null;
function loadXlsx(): Promise<XlsxModule> {
  xlsxPromise ??= import("xlsx");
  return xlsxPromise;
}
import { v4 as uuidv4 } from "uuid";
import { generateShortId } from "@kolektapos/qr";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";

// ── Column mapping ─────────────────────────────────────────────────────────
// Expected Excel headers (case-insensitive):
// owner, title, category, setName, setNumber, rarity, language, condition, edition,
// pricingMode, priceIdr, listedPriceIdr, bottomPriceIdr, isGraded,
// gradingCompany, grade, certNumber

const VALID_CONDITIONS = new Set([
  "Mint", "Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged",
]);
const VALID_LANGUAGES = new Set(["EN", "JP", "ID", "KR", "CN", "Other"]);
const VALID_PRICING_MODES = new Set(["fixed", "negotiable"]);

/** Placeholder owner used in the downloadable template. Rows with this
 *  owner are silently skipped at import so operators can leave the
 *  example rows in place. */
const SPECIMEN_OWNER = "ownner specimen";

function isSpecimenRow(rawRow: Record<string, string>): boolean {
  return (rawRow["owner"] ?? "").toLowerCase().trim() === SPECIMEN_OWNER;
}

interface ImportRow {
  rowNum: number;
  data: Record<string, string>;
  errors: string[];
  valid: boolean;
  ownerUserId?: string;
  cardBody?: Record<string, unknown>;
}

interface ImportUser {
  id: string;
  displayName: string;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

function validateRow(
  rawRow: Record<string, string>,
  rowNum: number,
  users: ImportUser[],
  currentUserId: string,
  activeEventId?: string
): ImportRow {
  const errors: string[] = [];

  const ownerName = rawRow["owner"] ?? "";
  const title = (rawRow["title"] ?? "").trim();
  const category = (rawRow["category"] ?? "").trim();
  const condition = rawRow["condition"] ?? "Near Mint";
  const language = rawRow["language"] ?? "EN";
  const pricingMode = rawRow["pricingmode"] ?? "fixed";
  const priceStr = rawRow["priceidr"] ?? "";
  const listedStr = rawRow["listedpriceidr"] ?? "";
  const bottomStr = rawRow["bottompriceidr"] ?? "";
  const isGradedRaw = (rawRow["isgraded"] ?? "").toLowerCase();
  const isGraded = isGradedRaw === "true" || isGradedRaw === "1" || isGradedRaw === "yes";

  if (!title) errors.push("title is required");
  if (!category) errors.push("category is required");
  if (!VALID_CONDITIONS.has(condition)) errors.push(`invalid condition: "${condition}"`);
  if (!VALID_LANGUAGES.has(language)) errors.push(`invalid language: "${language}"`);
  if (!VALID_PRICING_MODES.has(pricingMode)) errors.push(`invalid pricingMode: "${pricingMode}"`);

  // Owner lookup
  const matchedUser = users.find(
    (u) => u.displayName.toLowerCase() === ownerName.toLowerCase().trim()
  );
  if (!ownerName.trim()) {
    errors.push("owner is required");
  } else if (!matchedUser) {
    errors.push(`owner not found: "${ownerName}"`);
  }

  let priceIdr: number | undefined;
  let listedPriceIdr: number | undefined;
  let bottomPriceIdr: number | undefined;

  if (pricingMode === "fixed") {
    priceIdr = parseInt(priceStr, 10);
    if (isNaN(priceIdr) || priceIdr <= 0) errors.push("priceIdr must be a positive integer for fixed pricing");
  } else {
    listedPriceIdr = parseInt(listedStr, 10);
    bottomPriceIdr = parseInt(bottomStr, 10);
    if (isNaN(listedPriceIdr) || listedPriceIdr <= 0) errors.push("listedPriceIdr required for negotiable pricing");
    if (isNaN(bottomPriceIdr) || bottomPriceIdr <= 0) errors.push("bottomPriceIdr required for negotiable pricing");
    if (!isNaN(listedPriceIdr) && !isNaN(bottomPriceIdr) && bottomPriceIdr > listedPriceIdr) {
      errors.push("bottomPriceIdr must not exceed listedPriceIdr");
    }
  }

  if (isGraded) {
    const gc = (rawRow["gradingcompany"] ?? "").trim();
    const grade = (rawRow["grade"] ?? "").trim();
    if (!gc) errors.push("gradingCompany required when isGraded=true");
    if (!grade) errors.push("grade required when isGraded=true");
  }

  const ownerIndex = matchedUser ? users.indexOf(matchedUser) : 0;
  const shortId = generateShortId(ownerIndex);
  const clientId = uuidv4();

  const cardBody: Record<string, unknown> = {
    clientId,
    shortId,
    ownerUserId: matchedUser?.id ?? "",
    stockReceivedByUserId: currentUserId,
    eventId: activeEventId,
    title,
    category,
    setName: (rawRow["setname"] ?? "").trim(),
    setNumber: (rawRow["setnumber"] ?? "").trim(),
    rarity: (rawRow["rarity"] ?? "").trim(),
    language,
    condition,
    edition: (rawRow["edition"] ?? "").trim(),
    pricingMode,
    isGraded,
    ...(isGraded ? {
      gradingCompany: (rawRow["gradingcompany"] ?? "").trim(),
      grade: (rawRow["grade"] ?? "").trim(),
      certNumber: (rawRow["certnumber"] ?? "").trim() || undefined,
    } : {}),
    ...(pricingMode === "fixed" ? { priceIdr } : { listedPriceIdr, bottomPriceIdr }),
  };

  return {
    rowNum,
    data: rawRow,
    errors,
    valid: errors.length === 0,
    ownerUserId: matchedUser?.id,
    cardBody,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export function BulkImportPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importErrors, setImportErrors] = useState<{ rowNum: number; error: string }[]>([]);
  const [done, setDone] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setRows([]);
    setDone(false);
    setImportErrors([]);

    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) throw new Error("Tidak ada sheet ditemukan.");

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (raw.length === 0) throw new Error("Sheet kosong atau header tidak ditemukan.");

      // Normalize headers
      const normalized = raw.map((row) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          out[normalizeHeader(k)] = String(v ?? "").trim();
        }
        return out;
      });

      // Load users and active event
      const [users, activeEvent] = await Promise.all([
        idb.users.toArray(),
        idb.events.filter((e) => e.status === "active").first(),
      ]);

      const importUsers: ImportUser[] = users.map((u) => ({ id: u.id, displayName: u.displayName }));

      // Template-example rows carry a placeholder owner — silently drop them
      // so the UI only shows real rows.
      const withoutSpecimens = normalized.filter((row) => !isSpecimenRow(row));

      const parsed = withoutSpecimens.map((row, idx) =>
        validateRow(row, idx + 2, importUsers, user!.id, activeEvent?.id)
      );

      setRows(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Gagal membaca file.");
    }
  }, [user]);

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: validRows.length });
    setImportErrors([]);

    const errs: { rowNum: number; error: string }[] = [];
    let done = 0;

    const activeEvent = await idb.events.filter((e) => e.status === "active").first();

    for (const row of validRows) {
      try {
        const created = await api.cards.create(row.cardBody as Parameters<typeof api.cards.create>[0]) as { id: string };
        // Persist to IDB immediately
        await idb.cards.put({
          id: created.id,
          clientId: row.cardBody!.clientId as string,
          shortId: row.cardBody!.shortId as string,
          ownerUserId: row.cardBody!.ownerUserId as string,
          stockReceivedByUserId: user!.id,
          eventId: activeEvent?.id,
          title: row.cardBody!.title as string,
          category: row.cardBody!.category as string ?? "",
          setName: row.cardBody!.setName as string ?? "",
          setNumber: row.cardBody!.setNumber as string ?? "",
          rarity: row.cardBody!.rarity as string ?? "",
          language: row.cardBody!.language as string ?? "EN",
          condition: row.cardBody!.condition as string ?? "Near Mint",
          edition: row.cardBody!.edition as string ?? "",
          isGraded: row.cardBody!.isGraded as boolean ?? false,
          gradingCompany: row.cardBody!.gradingCompany as string | undefined,
          grade: row.cardBody!.grade as string | undefined,
          certNumber: row.cardBody!.certNumber as string | undefined,
          pricingMode: row.cardBody!.pricingMode as "fixed" | "negotiable",
          priceIdr: row.cardBody!.priceIdr as number | undefined,
          listedPriceIdr: row.cardBody!.listedPriceIdr as number | undefined,
          bottomPriceIdr: row.cardBody!.bottomPriceIdr as number | undefined,
          status: "available",
          oversold: false,
          version: 1,
        });
      } catch (err) {
        errs.push({ rowNum: row.rowNum, error: err instanceof Error ? err.message : "Unknown error" });
      }
      done++;
      setImportProgress({ done, total: validRows.length });
    }

    setImportErrors(errs);
    setImporting(false);
    setDone(true);
  }

  function downloadErrorReport() {
    const lines = ["rowNum,error"];
    for (const e of importErrors) lines.push(`${e.rowNum},"${e.error.replace(/"/g, '""')}"`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate() {
    const XLSX = await loadXlsx();
    const headers = [
      "owner", "title", "category", "setName", "setNumber", "rarity", "language", "condition", "edition",
      "pricingMode", "priceIdr", "listedPriceIdr", "bottomPriceIdr",
      "isGraded", "gradingCompany", "grade", "certNumber",
    ];
    // Placeholder owner — all template rows are skipped at import time
    // (see SPECIMEN_OWNER below), so operators can keep the examples in place
    // and layer their real rows on top.
    const O = "Ownner Specimen";
    const examples: (string | number)[][] = [
      // Graded + fixed (5)
      [O, "Charizard VSTAR", "Pokemon", "Brilliant Stars", "018/172", "Ultra Rare", "EN", "Near Mint", "", "fixed", 2500000, "", "", "true", "PSA", "10", "12345678"],
      [O, "Pikachu VMAX", "Pokemon", "Vivid Voltage", "044/185", "Secret Rare", "JP", "Near Mint", "", "fixed", 1800000, "", "", "true", "BGS", "9.5", "87654321"],
      [O, "Blastoise ex", "Pokemon", "151", "009/165", "Double Rare", "EN", "Near Mint", "", "fixed", 1200000, "", "", "true", "CGC", "9", "11223344"],
      [O, "Mewtwo V", "Pokemon", "Pokemon GO", "030/078", "Ultra Rare", "EN", "Near Mint", "", "fixed", 750000, "", "", "true", "SGC", "8.5", "55667788"],
      [O, "Eevee VMAX Rainbow", "Pokemon", "Evolving Skies", "215/203", "Rainbow Rare", "KR", "Near Mint", "", "fixed", 3500000, "", "", "true", "Other", "10", "99887766"],
      // Graded + negotiable (5)
      [O, "Charizard 1st Edition", "Pokemon", "Base Set", "004/102", "Holo Rare", "EN", "Near Mint", "", "negotiable", "", 50000000, 45000000, "true", "PSA", "10", "10101010"],
      [O, "Lugia 1st Edition", "Pokemon", "Neo Genesis", "009/111", "Holo Rare", "EN", "Near Mint", "", "negotiable", "", 15000000, 12000000, "true", "BGS", "9", "20202020"],
      [O, "Ho-oh Gold Star", "Pokemon", "EX Dragon Frontiers", "102/101", "Gold Star", "EN", "Near Mint", "", "negotiable", "", 22000000, 19000000, "true", "CGC", "9.5", "30303030"],
      [O, "Rayquaza EX", "Pokemon", "EX Deoxys", "097/107", "Ultra Rare", "EN", "Near Mint", "", "negotiable", "", 8500000, 7000000, "true", "PSA", "9", "40404040"],
      [O, "Umbreon Gold Star", "Pokemon", "POP Series 5", "017/017", "Gold Star", "EN", "Near Mint", "", "negotiable", "", 35000000, 30000000, "true", "BGS", "8", "50505050"],
      // Not graded + fixed (5)
      [O, "Arceus VSTAR", "Pokemon", "Brilliant Stars", "124/172", "Ultra Rare", "EN", "Near Mint", "", "fixed", 350000, "", "", "false", "", "", ""],
      [O, "Gardevoir ex", "Pokemon", "Scarlet & Violet", "086/198", "Double Rare", "EN", "Mint", "", "fixed", 180000, "", "", "false", "", "", ""],
      [O, "Mimikyu V", "Pokemon", "Vivid Voltage", "099/185", "Ultra Rare", "JP", "Near Mint", "", "fixed", 85000, "", "", "false", "", "", ""],
      [O, "Sylveon V", "Pokemon", "Evolving Skies", "074/203", "Ultra Rare", "EN", "Near Mint", "", "fixed", 120000, "", "", "false", "", "", ""],
      [O, "Lucario V", "Pokemon", "Vivid Voltage", "094/185", "Ultra Rare", "ID", "Lightly Played", "", "fixed", 60000, "", "", "false", "", "", ""],
      // Not graded + negotiable (5)
      [O, "Charizard V", "Pokemon", "Shining Fates", "019/073", "Ultra Rare", "EN", "Near Mint", "", "negotiable", "", 650000, 550000, "false", "", "", ""],
      [O, "Pikachu V-Union", "Pokemon", "Celebrations", "054/025", "Full Art", "EN", "Mint", "", "negotiable", "", 450000, 350000, "false", "", "", ""],
      [O, "Machamp V", "Pokemon", "Vivid Voltage", "080/185", "Ultra Rare", "EN", "Near Mint", "", "negotiable", "", 95000, 75000, "false", "", "", ""],
      [O, "Eevee V", "Pokemon", "Evolving Skies", "148/203", "Ultra Rare", "CN", "Near Mint", "", "negotiable", "", 75000, 60000, "false", "", "", ""],
      [O, "Mew V", "Pokemon", "Fusion Strike", "113/264", "Ultra Rare", "EN", "Near Mint", "", "negotiable", "", 130000, 105000, "false", "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "kolektapos-bulk-import-template.xlsx");
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Bulk Import Kartu" back onBack={() => navigate("/stock-receive")} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-3">
        {/* Instructions */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Instruksi</p>
          <p className="text-sm text-muted-fg">
            Upload file Excel (.xlsx) dengan kolom:{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded-lg font-mono">
              owner, title, category, setName, setNumber, rarity, language, condition, edition, pricingMode, priceIdr, listedPriceIdr, bottomPriceIdr, isGraded, gradingCompany, grade, certNumber
            </code>
          </p>
          <button onClick={downloadTemplate}
            className="text-sm font-bold text-accent border border-accent border-opacity-40 rounded-xl px-3 py-1.5 hover:bg-accent hover:bg-opacity-10 transition">
            Download Template
          </button>
        </div>

        {/* File picker */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Upload File</p>
          <input type="file" accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="text-sm text-muted-fg file:mr-3 file:text-sm file:font-bold file:bg-primary file:bg-opacity-10 file:text-primary file:border-0 file:px-3 file:py-1.5 file:rounded-xl hover:file:bg-opacity-20" />
          {parseError && (
            <p className="text-sm text-destructive font-medium">{parseError}</p>
          )}
        </div>

        {/* Validation summary */}
        {rows.length > 0 && !done && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">Validasi</p>
            <div className="flex gap-3">
              <div className="flex-1 bg-success bg-opacity-10 rounded-xl px-3 py-3 text-center border border-success border-opacity-20">
                <p className="text-2xl font-extrabold text-success">{validRows.length}</p>
                <p className="text-xs font-bold text-success opacity-80">Baris valid</p>
              </div>
              <div className="flex-1 bg-destructive bg-opacity-10 rounded-xl px-3 py-3 text-center border border-destructive border-opacity-20">
                <p className="text-2xl font-extrabold text-destructive">{invalidRows.length}</p>
                <p className="text-xs font-bold text-destructive opacity-80">Baris error</p>
              </div>
            </div>

            {invalidRows.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <p className="text-xs font-extrabold text-destructive">Error per baris:</p>
                {invalidRows.map((row) => (
                  <div key={row.rowNum} className="text-xs bg-destructive bg-opacity-5 rounded-xl px-3 py-2 border border-destructive border-opacity-15">
                    <p className="font-bold text-destructive">Baris {row.rowNum}</p>
                    <ul className="list-disc list-inside text-destructive opacity-80 space-y-0.5 mt-1">
                      {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {validRows.length > 0 && (
              <button onClick={handleImport} disabled={importing}
                className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl text-sm disabled:opacity-50 hover:opacity-90 transition">
                {importing
                  ? `Mengimpor… (${importProgress?.done ?? 0}/${importProgress?.total ?? 0})`
                  : `Import ${validRows.length} Kartu`}
              </button>
            )}
          </div>
        )}

        {/* Import done */}
        {done && (
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-success bg-opacity-15 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="font-bold text-fg">Import selesai</p>
              <p className="text-sm text-muted-fg mt-1">
                {validRows.length - importErrors.length} berhasil
                {importErrors.length > 0 && (
                  <span className="text-destructive font-bold"> · {importErrors.length} gagal</span>
                )}
              </p>
            </div>
            {importErrors.length > 0 && (
              <button onClick={downloadErrorReport}
                className="w-full h-11 text-sm font-bold text-destructive border border-destructive border-opacity-40 rounded-2xl hover:bg-destructive hover:bg-opacity-5 transition">
                Download Error Report
              </button>
            )}
            <button onClick={() => { setRows([]); setDone(false); setImportErrors([]); }}
              className="w-full h-11 text-sm font-bold text-accent border border-accent border-opacity-40 rounded-2xl hover:bg-accent hover:bg-opacity-10 transition">
              Import Lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
