import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createClass,
  fetchClasses,
  setClassStatus,
  type ClassRecord,
} from "../services/classService";

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString();
}

function formatTime(t?: string) {
  if (!t) return "—";
  // t is "HH:MM"; render in local 12-hour style.
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h)) return t;
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [dailyStart, setDailyStart] = useState("");
  const [dailyEnd, setDailyEnd] = useState("");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setClasses(await fetchClasses());
    } catch (err) {
      console.error(err);
      setError("Could not load classes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      classes.filter((c) =>
        showArchived ? c.status === "archived" : c.status === "active"
      ),
    [classes, showArchived]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Class name is required.");
      return;
    }
    if (dailyStart && dailyEnd && dailyEnd <= dailyStart) {
      setError("Daily end time must be after the start time.");
      return;
    }
    if (termStart && termEnd && termEnd < termStart) {
      setError("Term end date must be on or after the start date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createClass({
        name,
        grade: grade || undefined,
        dailyStart: dailyStart || undefined,
        dailyEnd: dailyEnd || undefined,
        // Parse as local dates (append T00:00 so it isn't treated as UTC).
        termStart: termStart ? new Date(`${termStart}T00:00`) : null,
        termEnd: termEnd ? new Date(`${termEnd}T00:00`) : null,
      });
      setName("");
      setGrade("");
      setDailyStart("");
      setDailyEnd("");
      setTermStart("");
      setTermEnd("");
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not create class.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(c: ClassRecord) {
    try {
      await setClassStatus(c.id, c.status === "active" ? "archived" : "active");
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not update class status.");
    }
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Classes</h1>
            <p className="text-sm text-slate-500">
              Create classes, set meeting times, and archive them at year-end.
            </p>
          </div>
          <Link
            to="/settings"
            className="text-sm font-medium text-sky-600 hover:text-sky-800 hover:underline"
          >
            ← Settings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-6 pb-12 pt-6">
        {/* CREATE CLASS */}
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-800">New class</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600">
                Class name <span className="text-rose-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. EMR — 1st Period"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Grade level
              </label>
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. 11"
                className={inputCls}
              />
            </div>
            <div />
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Daily start time
              </label>
              <input
                type="time"
                value={dailyStart}
                onChange={(e) => setDailyStart(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Daily end time
              </label>
              <input
                type="time"
                value={dailyEnd}
                onChange={(e) => setDailyEnd(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Term start date
              </label>
              <input
                type="date"
                value={termStart}
                onChange={(e) => setTermStart(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Term end date
              </label>
              <input
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create class"}
          </button>
        </form>

        {/* CLASS LIST */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {showArchived ? "Archived classes" : "Active classes"}
            </h2>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
            >
              {showArchived ? "Show active" : "Show archived"}
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Grade</th>
                  <th className="px-4 py-2">Daily time</th>
                  <th className="px-4 py-2">Term</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {c.name}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{c.grade || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {c.dailyStart || c.dailyEnd
                        ? `${formatTime(c.dailyStart)} – ${formatTime(c.dailyEnd)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {c.termStart || c.termEnd
                        ? `${formatDate(c.termStart)} – ${formatDate(c.termEnd)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleArchiveToggle(c)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {c.status === "active" ? "Archive" : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      {showArchived
                        ? "No archived classes."
                        : "No active classes yet. Create one above."}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
