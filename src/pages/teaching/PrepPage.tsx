import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listRecords, updateRecord, type TeachingRecord } from "../../services/teachingService";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  const d = new Date(`${v}T00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function PrepPage() {
  const [lessons, setLessons] = useState<TeachingRecord[]>([]);
  const [materials, setMaterials] = useState<TeachingRecord[]>([]);
  const [courses, setCourses] = useState<TeachingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86400000));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ls, ms, cs] = await Promise.all([
        listRecords("lessonDays"),
        listRecords("materials"),
        listRecords("courses"),
      ]);
      setLessons(ls);
      setMaterials(ms);
      setCourses(cs);
    } catch (err) {
      console.error(err);
      setError("Could not load prep list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const courseName = (ids?: string[]) =>
    (ids ?? []).map((id) => courses.find((c) => c.id === id)?.course as string | undefined).filter(Boolean).join(", ");

  const inWeek = (d: unknown) => typeof d === "string" && d >= today && d <= weekAhead;
  const isDone = (s: unknown) => String(s ?? "").toLowerCase() === "done";
  const byDate = (a: TeachingRecord, b: TeachingRecord, k: string) =>
    String(a[k] ?? "9999").localeCompare(String(b[k] ?? "9999"));

  const copies = useMemo(
    () => lessons.filter((l) => l.copiesNeeded === true && inWeek(l.date)).sort((a, b) => byDate(a, b, "date")),
    [lessons, today, weekAhead]
  );
  const labs = useMemo(
    () => lessons.filter((l) => l.labSetupNeeded === true && inWeek(l.date)).sort((a, b) => byDate(a, b, "date")),
    [lessons, today, weekAhead]
  );
  const gather = useMemo(
    () =>
      materials
        .filter((m) => !isDone(m.status) && (typeof m.neededBy !== "string" || m.neededBy <= weekAhead))
        .sort((a, b) => byDate(a, b, "neededBy")),
    [materials, weekAhead]
  );

  // Optimistically clear a lesson flag / mark a material done, then persist.
  async function clearLessonFlag(l: TeachingRecord, key: "copiesNeeded" | "labSetupNeeded") {
    setLessons((prev) => prev.map((x) => (x.id === l.id ? { ...x, [key]: false } : x)));
    try {
      await updateRecord(l.id, "lessonDays", { [key]: false });
    } catch (err) {
      console.error(err);
      setError("Could not update.");
      void load();
    }
  }
  async function markMaterialDone(m: TeachingRecord) {
    setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "Done" } : x)));
    try {
      await updateRecord(m.id, "materials", { status: "Done" });
    } catch (err) {
      console.error(err);
      setError("Could not update.");
      void load();
    }
  }

  const rowCls = "flex items-start gap-3 py-2";
  const empty = "text-sm italic text-slate-400";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/teaching" className="text-xs font-medium text-sky-600 hover:underline">← Teaching HQ</Link>
            <h1 className="text-xl font-semibold tracking-tight">🧰 This Week's Prep</h1>
            <p className="text-sm text-slate-500">Everything to copy, set up, and gather for the next 7 days. Check it off as you go.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-6 pb-12 pt-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {/* Copies to print */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">🖨 Copies to print ({copies.length})</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {copies.length === 0 && <p className={empty}>Nothing to print this week.</p>}
            {copies.map((l) => (
              <label key={l.id} className={rowCls}>
                <input type="checkbox" className="mt-1 h-4 w-4" onChange={() => clearLessonFlag(l, "copiesNeeded")} />
                <span>
                  <span className="font-medium text-slate-800">{(l.lesson as string) || "(untitled)"}</span>
                  <span className="block text-xs text-slate-500">{fmt(l.date)} · {courseName(l.course as string[])}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Labs to set up */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">🔬 Labs to set up ({labs.length})</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {labs.length === 0 && <p className={empty}>No lab setups this week.</p>}
            {labs.map((l) => (
              <label key={l.id} className={rowCls}>
                <input type="checkbox" className="mt-1 h-4 w-4" onChange={() => clearLessonFlag(l, "labSetupNeeded")} />
                <span>
                  <span className="font-medium text-slate-800">{(l.lesson as string) || "(untitled)"}</span>
                  <span className="block text-xs text-slate-500">{fmt(l.date)} · {courseName(l.course as string[])}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Materials to gather / order */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">📦 Materials to gather ({gather.length})</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {gather.length === 0 && <p className={empty}>Nothing outstanding.</p>}
            {gather.map((m) => (
              <label key={m.id} className={rowCls}>
                <input type="checkbox" className="mt-1 h-4 w-4" onChange={() => markMaterialDone(m)} />
                <span>
                  <span className="font-medium text-slate-800">{(m.item as string) || "(item)"}</span>
                  {typeof m.qtyNeeded === "number" && <span className="text-slate-500"> ×{m.qtyNeeded}</span>}
                  <span className="block text-xs text-slate-500">
                    {m.category as string}
                    {m.neededBy ? ` · needed ${fmt(m.neededBy)}` : ""}
                    {(m.sourceVendor as string) ? ` · ${m.sourceVendor}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <p className="text-xs text-slate-400">
          Checking an item off updates the record: copies/lab flags clear, materials mark Done.
          Manage the full lists in{" "}
          <Link to="/teaching/db/materials" className="text-sky-600 hover:underline">Materials</Link>.
        </p>
      </main>
    </div>
  );
}
