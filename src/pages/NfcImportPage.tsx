import { useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Sticker inventory ────────────────────────────────────────────────────────
// These are the 30 physical NFC stickers. Index 0 = Sticker #1.
const STICKERS: string[] = [
  "04:E7:49:AC:84:26:81",
  "04:87:8B:AC:84:26:81",
  "04:F5:43:AC:84:26:81",
  "04:59:AF:AC:84:26:81",
  "04:26:72:AC:84:26:81",
  "04:1F:5A:AC:84:26:81",
  "04:B1:D4:AC:84:26:81",
  "04:AB:C5:AC:84:26:81",
  "04:15:68:AC:84:26:81",
  "04:B1:9B:AC:84:26:81",
  "04:F1:BE:AC:84:26:81",
  "04:19:3A:AC:84:26:81",
  "04:78:E4:AB:84:26:81",
  "04:3E:E9:AB:84:26:81",
  "04:A1:22:AC:84:26:81",
  "04:23:28:AC:84:26:81",
  "04:94:14:AC:84:26:81",
  "04:B4:2F:AC:84:26:81",
  "04:6B:DD:AB:84:26:81",
  "04:B6:A2:AC:84:26:81",
  "04:27:1A:AC:84:26:81",
  "04:31:FE:AB:84:26:81",
  "04:3A:B6:AC:84:26:81",
  "04:6B:F2:AB:84:26:81",
  "04:26:82:CA:84:26:81",
  "04:88:41:AC:84:26:81",
  "04:77:47:AC:84:26:81",
  "04:8F:36:AC:84:26:81",
  "04:32:CE:AC:84:26:81",
  "04:FF:53:AC:84:26:81",
];

/** Strip colons/spaces and uppercase so CSV format doesn't matter */
function normalizeNfcId(id: string): string {
  return id.replace(/[:\s]/g, "").toUpperCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchMode = "studentId" | "email";

type ParsedRow = {
  key: string;   // studentId or email value from CSV
  nfcId: string; // normalized UID
};

type ResultRow = ParsedRow & {
  status: "ok" | "notFound" | "error";
  studentName?: string;
  detail?: string;
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { mode: MatchMode | null; rows: ParsedRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2)
    return { mode: null, rows: [], error: "CSV must have a header row and at least one data row." };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nfcIdx = headers.indexOf("nfcid");
  if (nfcIdx === -1)
    return { mode: null, rows: [], error: 'CSV must have a column named "nfcId".' };

  let mode: MatchMode | null = null;
  let keyIdx = -1;

  if (headers.includes("studentid")) {
    mode = "studentId";
    keyIdx = headers.indexOf("studentid");
  } else if (headers.includes("email")) {
    mode = "email";
    keyIdx = headers.indexOf("email");
  } else {
    return { mode: null, rows: [], error: 'CSV must have either a "studentId" or "email" column.' };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const key = cols[keyIdx] || "";
    const raw = cols[nfcIdx] || "";
    if (key && raw) rows.push({ key, nfcId: normalizeNfcId(raw) });
  }

  if (rows.length === 0)
    return { mode, rows: [], error: "No valid data rows found." };

  return { mode, rows };
}

function downloadTemplate() {
  const header = "email,nfcId";
  const rows = STICKERS.map((uid) => `,${normalizeNfcId(uid)}`).join("\n");
  const csv = `${header}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nfc-assignment-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NfcImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<MatchMode | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [showStickerList, setShowStickerList] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState("");

  // ── File pick ────────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError("");
    setPreview([]);
    setResults([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      const { mode: m, rows, error } = parseCSV(text);
      if (error) { setParseError(error); return; }
      setMode(m);
      setPreview(rows);
    };
    reader.readAsText(file);
  };

  // ── Import ───────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!mode || preview.length === 0) return;
    setImporting(true);
    setDone(false);

    const resultRows: ResultRow[] = [];

    for (const row of preview) {
      if (mode === "studentId") {
        resultRows.push({ ...row, status: "ok" });
      } else {
        try {
          const snap = await getDocs(
            query(collection(db, "students"), where("email", "==", row.key))
          );
          if (snap.empty) {
            resultRows.push({ ...row, status: "notFound", detail: "Email not found" });
          } else {
            resultRows.push({
              ...row,
              status: "ok",
              studentName: snap.docs[0].data().name,
              key: snap.docs[0].id,
            });
          }
        } catch (err: unknown) {
          resultRows.push({
            ...row,
            status: "error",
            detail: err instanceof Error ? err.message : "Lookup failed",
          });
        }
      }
    }

    // Batch-write nfcId to resolved student docs
    const BATCH_LIMIT = 400;
    let batch = writeBatch(db);
    let count = 0;

    for (const row of resultRows) {
      if (row.status !== "ok") continue;
      batch.update(doc(db, "students", row.key), { nfcId: row.nfcId });
      count++;
      if (count % BATCH_LIMIT === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    if (count % BATCH_LIMIT !== 0) await batch.commit();

    // Enrich names for studentId-mode rows
    if (mode === "studentId") {
      for (const row of resultRows) {
        if (row.status !== "ok" || row.studentName) continue;
        try {
          const snap = await getDocs(
            query(collection(db, "students"), where("__name__", "==", row.key))
          );
          if (!snap.empty) row.studentName = snap.docs[0].data().name;
        } catch { /* cosmetic — ignore */ }
      }
    }

    setResults(resultRows);
    setImporting(false);
    setDone(true);
  };

  // ── Re-normalize existing records ────────────────────────────────────────────
  const handleNormalize = async () => {
    setNormalizing(true);
    setNormalizeResult("");
    try {
      const snap = await getDocs(collection(db, "students"));
      const toFix = snap.docs.filter((d) => {
        const raw = d.data().nfcId;
        return typeof raw === "string" && raw.includes(":");
      });

      if (toFix.length === 0) {
        setNormalizeResult("All NFC IDs already normalized — nothing to do.");
        setNormalizing(false);
        return;
      }

      let batch = writeBatch(db);
      let count = 0;
      for (const d of toFix) {
        batch.update(doc(db, "students", d.id), {
          nfcId: normalizeNfcId(d.data().nfcId),
        });
        count++;
        if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
      }
      await batch.commit();
      setNormalizeResult(`✓ Fixed ${count} record${count !== 1 ? "s" : ""} — colons removed.`);
    } catch (err: unknown) {
      setNormalizeResult(`✗ ${err instanceof Error ? err.message : "Failed"}`);
    }
    setNormalizing(false);
  };

  const successCount = results.filter((r) => r.status === "ok").length;
  const failCount    = results.filter((r) => r.status !== "ok").length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">NFC Card Assignment</h1>
            <p className="text-xs text-slate-400">
              Upload a CSV to assign sticker IDs to students, then deploy to{" "}
              <span className="text-slate-300">www.taft-ranch.com/nfc-login</span>
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600
              text-xs font-semibold text-slate-200 transition-colors"
          >
            Download Template CSV
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-6 space-y-8">

        {/* One-time fix: strip colons from existing records */}
        <section className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Existing Records Have Colons?</p>
            <p className="text-xs text-amber-500 mt-0.5">
              If NFC IDs were saved as <span className="font-mono">04:87:8B:AC</span> they need to be
              normalized to <span className="font-mono">04878BAC</span> so card scans match.
            </p>
            {normalizeResult && (
              <p className={`text-xs mt-1 font-semibold ${normalizeResult.startsWith("✓") ? "text-emerald-400" : "text-rose-400"}`}>
                {normalizeResult}
              </p>
            )}
          </div>
          <button
            onClick={handleNormalize}
            disabled={normalizing}
            className="shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500
              disabled:opacity-50 text-sm font-semibold text-white transition-colors"
          >
            {normalizing ? "Fixing…" : "Re-normalize All Cards"}
          </button>
        </section>

        {/* Sticker reference list */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Sticker Inventory — {STICKERS.length} cards
            </h2>
            <button
              onClick={() => setShowStickerList((v) => !v)}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              {showStickerList ? "Hide" : "Show all"}
            </button>
          </div>
          <p className="text-sm text-slate-400">
            Each sticker number maps to a fixed UID. Assign a sticker number to each student in
            your CSV — the system stores the UID automatically.
          </p>

          {showStickerList && (
            <div className="overflow-x-auto rounded border border-slate-700 mt-2">
              <table className="w-full text-xs">
                <thead className="bg-slate-800 text-slate-400 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left w-16">#</th>
                    <th className="px-3 py-2 text-left">Raw UID</th>
                    <th className="px-3 py-2 text-left">Stored as (normalized)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {STICKERS.map((uid, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{uid}</td>
                      <td className="px-3 py-1.5 font-mono text-sky-400">{normalizeNfcId(uid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* CSV format guide */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            CSV Format
          </h2>
          <p className="text-sm text-slate-400">
            Use <code className="text-sky-400">email</code> or{" "}
            <code className="text-sky-400">studentId</code> (Firestore doc ID) to identify each
            student. The <code className="text-sky-400">nfcId</code> column accepts the UID with or
            without colons — both are normalised to the same value.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Option A — by Email</p>
              <pre className="text-xs bg-slate-800 rounded p-3 text-sky-400 whitespace-pre">{`email,nfcId
john@school.edu,04E749AC842681
jane@school.edu,04:87:8B:AC:84:26:81`}</pre>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Option B — by Student ID</p>
              <pre className="text-xs bg-slate-800 rounded p-3 text-emerald-400 whitespace-pre">{`studentId,nfcId
abc123,04E749AC842681
xyz789,04878BAC842681`}</pre>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Hit <strong className="text-slate-400">Download Template CSV</strong> above to get a
            pre-filled file with all 30 sticker IDs — just add the student email/ID column.
          </p>
        </section>

        {/* File picker */}
        <section className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">Upload CSV File</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm text-slate-300
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-sky-600 file:text-white
              hover:file:bg-sky-500 cursor-pointer"
          />
          {parseError && <p className="text-sm text-rose-400">{parseError}</p>}
        </section>

        {/* Preview */}
        {preview.length > 0 && !done && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">
                Preview — {preview.length} row{preview.length !== 1 ? "s" : ""}{" "}
                <span className="text-slate-500 font-normal">
                  (matching by <span className="text-sky-400">{mode}</span>)
                </span>
              </h2>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500
                  disabled:opacity-50 text-sm font-semibold text-white transition-colors"
              >
                {importing ? "Importing…" : `Import ${preview.length} Rows`}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">{mode === "email" ? "Email" : "Student ID"}</th>
                    <th className="px-4 py-2 text-left">NFC UID (normalized)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-slate-300">{row.key}</td>
                      <td className="px-4 py-2 font-mono text-sky-400">{row.nfcId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Results */}
        {done && results.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-emerald-400 font-semibold">✓ {successCount} updated</span>
              {failCount > 0 && (
                <span className="text-sm text-rose-400 font-semibold">✗ {failCount} failed</span>
              )}
              <button
                onClick={() => {
                  setPreview([]); setResults([]); setDone(false);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600
                  text-xs font-semibold text-slate-200 transition-colors"
              >
                Import Another File
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Student</th>
                    <th className="px-4 py-2 text-left">NFC UID</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-slate-300">{row.studentName || row.key}</td>
                      <td className="px-4 py-2 font-mono text-sky-400">{row.nfcId}</td>
                      <td className="px-4 py-2">
                        {row.status === "ok"
                          ? <span className="text-emerald-400">✓ Updated</span>
                          : <span className="text-rose-400">✗ {row.detail || "Failed"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
