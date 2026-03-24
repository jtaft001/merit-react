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

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchMode = "studentId" | "email";

type ParsedRow = {
  key: string;   // studentId or email value from CSV
  nfcId: string;
};

type ResultRow = ParsedRow & {
  status: "ok" | "notFound" | "error";
  studentName?: string;
  detail?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): { mode: MatchMode | null; rows: ParsedRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { mode: null, rows: [], error: "CSV must have a header row and at least one data row." };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nfcIdx = headers.indexOf("nfcid");
  if (nfcIdx === -1) {
    return { mode: null, rows: [], error: 'CSV must have a column named "nfcId".' };
  }

  let mode: MatchMode | null = null;
  let keyIdx = -1;

  if (headers.includes("studentid")) {
    mode = "studentId";
    keyIdx = headers.indexOf("studentid");
  } else if (headers.includes("email")) {
    mode = "email";
    keyIdx = headers.indexOf("email");
  } else {
    return {
      mode: null,
      rows: [],
      error: 'CSV must have either a "studentId" or "email" column.',
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const key = cols[keyIdx] || "";
    const nfcId = cols[nfcIdx] || "";
    if (key && nfcId) rows.push({ key, nfcId });
  }

  if (rows.length === 0) {
    return { mode, rows: [], error: "No valid data rows found." };
  }

  return { mode, rows };
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

  // ── File pick ──────────────────────────────────────────────────────────────

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
      if (error) {
        setParseError(error);
        return;
      }
      setMode(m);
      setPreview(rows);
    };
    reader.readAsText(file);
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!mode || preview.length === 0) return;
    setImporting(true);
    setDone(false);

    const resultRows: ResultRow[] = [];

    // Resolve studentId for every row
    for (const row of preview) {
      if (mode === "studentId") {
        resultRows.push({ ...row, status: "ok" });
      } else {
        // email lookup
        try {
          const snap = await getDocs(
            query(collection(db, "students"), where("email", "==", row.key), )
          );
          if (snap.empty) {
            resultRows.push({ ...row, status: "notFound", detail: "Email not found" });
          } else {
            resultRows.push({
              ...row,
              status: "ok",
              studentName: snap.docs[0].data().name,
              key: snap.docs[0].id, // swap key to resolved doc ID
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

    // Batch-write nfcId to all resolved student docs
    const BATCH_LIMIT = 400;
    let batch = writeBatch(db);
    let count = 0;

    for (const row of resultRows) {
      if (row.status !== "ok") continue;
      const ref = doc(db, "students", row.key);
      batch.update(ref, { nfcId: row.nfcId });
      count++;
      if (count % BATCH_LIMIT === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }

    if (count % BATCH_LIMIT !== 0) {
      await batch.commit();
    }

    // Enrich names for studentId-mode rows
    if (mode === "studentId") {
      for (const row of resultRows) {
        if (row.status !== "ok" || row.studentName) continue;
        try {
          const snap = await getDocs(
            query(collection(db, "students"), where("__name__", "==", row.key))
          );
          if (!snap.empty) row.studentName = snap.docs[0].data().name;
        } catch {
          // name enrichment is cosmetic — ignore errors
        }
      }
    }

    setResults(resultRows);
    setImporting(false);
    setDone(true);
  };

  // ── Derived counts ─────────────────────────────────────────────────────────

  const successCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status !== "ok").length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">NFC Card Import</h1>
            <p className="text-xs text-slate-400">
              Upload a CSV to assign NFC sticker IDs to students.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-6 space-y-8">

        {/* Instructions */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            CSV Format
          </h2>
          <p className="text-sm text-slate-400">
            Your CSV needs two columns. Use either <code className="text-sky-400">studentId</code> (Firestore doc ID)
            or <code className="text-sky-400">email</code> to identify the student, plus{" "}
            <code className="text-sky-400">nfcId</code> for the sticker ID.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Option A — by Student ID</p>
              <pre className="text-xs bg-slate-800 rounded p-3 text-emerald-400 whitespace-pre">
{`studentId,nfcId
abc123def,NFC-001
xyz789ghi,NFC-002`}
              </pre>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Option B — by Email</p>
              <pre className="text-xs bg-slate-800 rounded p-3 text-sky-400 whitespace-pre">
{`email,nfcId
john@school.edu,NFC-001
jane@school.edu,NFC-002`}
              </pre>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The <code className="text-slate-400">nfcId</code> value is what you program into the NFC sticker URL:{" "}
            <span className="text-slate-300">https://merit-ems.web.app/nfc-clock?nfc=NFC-001</span>
          </p>
        </section>

        {/* File picker */}
        <section className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">Choose CSV File</label>
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
          {parseError && (
            <p className="text-sm text-rose-400">{parseError}</p>
          )}
        </section>

        {/* Preview table */}
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
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50
                  text-sm font-semibold text-white transition-colors"
              >
                {importing ? "Importing…" : `Import ${preview.length} Rows`}
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">{mode === "email" ? "Email" : "Student ID"}</th>
                    <th className="px-4 py-2 text-left">NFC Sticker ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2 font-mono text-slate-300">{row.key}</td>
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
              <span className="text-sm text-emerald-400 font-semibold">
                ✓ {successCount} updated
              </span>
              {failCount > 0 && (
                <span className="text-sm text-rose-400 font-semibold">
                  ✗ {failCount} failed
                </span>
              )}
              <button
                onClick={() => {
                  setPreview([]);
                  setResults([]);
                  setDone(false);
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
                    <th className="px-4 py-2 text-left">NFC Sticker ID</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-slate-300">
                        {row.studentName || row.key}
                      </td>
                      <td className="px-4 py-2 font-mono text-sky-400">{row.nfcId}</td>
                      <td className="px-4 py-2">
                        {row.status === "ok" ? (
                          <span className="text-emerald-400">✓ Updated</span>
                        ) : (
                          <span className="text-rose-400">✗ {row.detail || "Failed"}</span>
                        )}
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
