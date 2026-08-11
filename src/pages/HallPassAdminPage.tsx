import { useCallback, useEffect, useMemo, useState } from "react";
import {
  subscribeOpenPasses,
  hallPassReturn,
  hallPassOverride,
  hallPassMarkExempt,
  hallPassRollover,
  getHallPassSettings,
  saveHallPassSettings,
  type PassRecord,
} from "../services/hallPassService";
import { fetchStudents, type StudentRecord } from "../services/studentService";
import type { HallPassSettings } from "../types/firestore";

function elapsed(from: Date | null, now: number): string {
  if (!from) return "—";
  const s = Math.max(0, Math.round((now - from.getTime()) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function toDate(v: unknown): Date | null {
  if (!v) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyV = v as any;
  if (typeof anyV.toDate === "function") return anyV.toDate();
  return new Date(anyV);
}
function ago(d: Date | null): string {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function HallPassAdminPage() {
  const [open, setOpen] = useState<PassRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [settings, setSettings] = useState<HallPassSettings | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ passesPerSemester: 5, pointsPerUnusedPass: 50, oneOutAtATime: false });
  const [newSemester, setNewSemester] = useState("");
  const [saving, setSaving] = useState(false);
  const [rollBusy, setRollBusy] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      setStudents(await fetchStudents());
    } catch (err) {
      console.error(err);
      setError("Could not load the roster.");
    }
  }, []);

  useEffect(() => {
    void loadRoster();
    getHallPassSettings()
      .then((s) => {
        setSettings(s);
        setForm({ passesPerSemester: s.passesPerSemester, pointsPerUnusedPass: s.pointsPerUnusedPass, oneOutAtATime: s.oneOutAtATime });
      })
      .catch(() => setSettings(null));
    const unsub = subscribeOpenPasses(setOpen);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsub(); clearInterval(tick); };
  }, [loadRoster]);

  const perPass = settings?.pointsPerUnusedPass ?? 50;
  const maxPasses = settings?.passesPerSemester ?? 5;

  const atZero = useMemo(() => students.filter((s) => (s.passesRemaining as number) === 0).length, [students]);
  const byPeriod = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const s of students) {
      const p = (s.className as string) || "Unassigned";
      (map.get(p) ?? map.set(p, []).get(p)!).push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [students]);

  async function markBack(p: PassRecord) {
    try { await hallPassReturn({ studentDocId: p.studentDocId }); setNotice(`${p.studentName} marked back.`); void loadRoster(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not mark back."); }
  }
  async function makeExempt(p: PassRecord) {
    try { await hallPassMarkExempt({ passId: p.id }); setNotice(`Pass for ${p.studentName} marked exempt.`); void loadRoster(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not mark exempt."); }
  }
  async function override(s: StudentRecord) {
    if (!window.confirm(`Grant an override pass to ${s.name}? (Does not use their balance.)`)) return;
    try { await hallPassOverride({ studentDocId: s.id }); setNotice(`Override pass granted to ${s.name}.`); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not grant override."); }
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    try {
      await saveHallPassSettings(form);
      setSettings((prev) => (prev ? { ...prev, ...form } : prev));
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function runRollover() {
    if (rollBusy) return; // guard against a double run
    const target = newSemester.trim();
    if (!target) { setError("Enter the new semester name first."); return; }
    if (!window.confirm(
      `Run semester rollover?\n\nThis pays out every student's unused passes (× ${perPass} pts) to the economy, resets everyone to ${maxPasses}, and sets the term to "${target}". It cannot be undone.`
    )) return;
    setRollBusy(true);
    setError("");
    try {
      const res = await hallPassRollover({ newSemester: target });
      setNotice(`Rollover complete: paid ${res.totalPoints} pts to ${res.studentsPaid} students. Now on ${res.newSemester}.`);
      setNewSemester("");
      const s = await getHallPassSettings();
      setSettings(s);
      void loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollover failed.");
    } finally {
      setRollBusy(false);
    }
  }

  const balColor = (n: number) => (n <= 0 ? "text-rose-600" : n <= 2 ? "text-amber-600" : "text-emerald-600");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">🚻 Hall Passes</h1>
          <p className="text-sm text-slate-500">
            {settings ? `${settings.currentSemester} · ${maxPasses} passes/student · ${perPass} pts each unused` : "Loading settings…"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-6 pb-12 pt-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} className="text-emerald-600 hover:underline">Dismiss</button>
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-3xl font-semibold tabular-nums">{open.length}</div>
            <div className="text-xs font-medium text-slate-500">out right now</div>
          </div>
          <div className={"rounded-2xl border bg-white p-4 shadow-sm " + (atZero > 0 ? "border-rose-200" : "border-slate-200")}>
            <div className={"text-3xl font-semibold tabular-nums " + (atZero > 0 ? "text-rose-600" : "")}>{atZero}</div>
            <div className="text-xs font-medium text-slate-500">students at zero</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-3xl font-semibold tabular-nums">{students.length}</div>
            <div className="text-xs font-medium text-slate-500">active students</div>
          </div>
        </div>

        {/* Currently out */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Currently out</h2>
          {open.length === 0 ? (
            <p className="mt-2 text-sm italic text-slate-400">Nobody is out right now.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {open.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <span className="font-medium text-slate-800">{p.studentName}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{p.destination}</span>
                    {p.teacherOverride && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">override</span>}
                    {p.exempt && !p.teacherOverride && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">exempt</span>}
                    <span className="ml-2 text-xs text-slate-400">{p.period}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg tabular-nums text-slate-700">{elapsed(p.outAt, now)}</span>
                    {!p.exempt && (
                      <button onClick={() => makeExempt(p)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Make exempt</button>
                    )}
                    <button onClick={() => markBack(p)} className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700">Mark back</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Roster by period */}
        {byPeriod.map(([period, roster]) => (
          <section key={period} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">{period} <span className="text-slate-400">· {roster.length}</span></h2>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2">Passes left</th>
                    <th className="px-4 py-2">Last used</th>
                    <th className="px-4 py-2">Projected payout</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const left = (s.passesRemaining as number) ?? maxPasses;
                    return (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{s.name}</td>
                        <td className={"px-4 py-2 font-semibold tabular-nums " + balColor(left)}>{left} / {maxPasses}</td>
                        <td className="px-4 py-2 text-slate-500">{ago(toDate(s.lastPassAt))}</td>
                        <td className="px-4 py-2 text-slate-700 tabular-nums">{left * perPass} pts</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => override(s)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Override pass</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {/* Settings & semester rollover */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Settings</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-600">Passes per semester</span>
              <input type="number" min={0} value={form.passesPerSemester}
                onChange={(e) => setForm((f) => ({ ...f, passesPerSemester: Number(e.target.value) || 0 }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-600">Points per unused pass</span>
              <input type="number" min={0} value={form.pointsPerUnusedPass}
                onChange={(e) => setForm((f) => ({ ...f, pointsPerUnusedPass: Number(e.target.value) || 0 }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500" />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.oneOutAtATime}
                onChange={(e) => setForm((f) => ({ ...f, oneOutAtATime: e.target.checked }))} />
              One student out at a time
            </label>
          </div>
          <button onClick={saveSettings} disabled={saving}
            className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save settings"}
          </button>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Semester rollover</h3>
            <p className="mt-1 text-xs text-slate-500">
              Pays out unused passes to the economy ({perPass} pts each), resets everyone to {maxPasses}, and advances the term.
              Current term: <span className="font-medium">{settings?.currentSemester}</span>.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={newSemester} onChange={(e) => setNewSemester(e.target.value)} placeholder="new semester, e.g. 2027-spring"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500" />
              <button onClick={runRollover} disabled={rollBusy || !newSemester.trim()}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {rollBusy ? "Running…" : "Run rollover"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
