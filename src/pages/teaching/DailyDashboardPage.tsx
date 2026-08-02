import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { COLOR_CLASSES, getCollection, optionColor, type Field } from "../../teaching/schema";
import { listRecords, type TeachingRecord } from "../../services/teachingService";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A date label relative to today: "Today", "Tomorrow", "Overdue · …", or a date. */
function DateLabel({ value, done }: { value: unknown; done?: boolean }) {
  if (!value || typeof value !== "string") return null;
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const d = new Date(`${value}T00:00`);
  const nice = Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  let text = nice;
  let cls = "text-slate-500";
  if (value === today) { text = "Today"; cls = "font-semibold text-amber-600"; }
  else if (value === tomorrow) { text = "Tomorrow"; cls = "text-slate-600"; }
  else if (!done && value < today) { text = `Overdue · ${nice}`; cls = "font-semibold text-rose-600"; }

  return <span className={"whitespace-nowrap text-xs " + cls}>{text}</span>;
}

function Chip({ fieldId, type, value }: { fieldId: string; type: string; value?: string }) {
  if (!value) return null;
  const field = getCollection(type)?.fields.find((f) => f.key === fieldId) as Field | undefined;
  const color = field ? optionColor(field, value) : "default";
  return (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + COLOR_CLASSES[color]}>
      {value}
    </span>
  );
}

type Data = {
  lessonDays: TeachingRecord[];
  tasks: TeachingRecord[];
  deadlines: TeachingRecord[];
  materials: TeachingRecord[];
  emails: TeachingRecord[];
  districtCalendar: TeachingRecord[];
  courses: TeachingRecord[];
};

const EMPTY: Data = {
  lessonDays: [], tasks: [], deadlines: [], materials: [], emails: [], districtCalendar: [], courses: [],
};

function Tile({ value, label, to, tone = "default" }: {
  value: number; label: string; to: string; tone?: "default" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-white text-slate-800";
  return (
    <Link to={to} className={"rounded-2xl border p-4 shadow-sm transition hover:shadow " + toneCls}>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium opacity-80">{label}</div>
    </Link>
  );
}

function Section({ title, subtitle, to, children, empty }: {
  title: string; subtitle: string; to: string; children: React.ReactNode; empty: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link to={to} className="whitespace-nowrap text-xs font-medium text-sky-600 hover:underline">
          Open →
        </Link>
      </div>
      <div className="mt-3">
        {empty ? <p className="text-sm italic text-slate-400">Nothing here — you’re in good shape.</p> : children}
      </div>
    </section>
  );
}

export default function DailyDashboardPage() {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86400000));

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [lessonDays, tasks, deadlines, materials, emails, districtCalendar, courses] = await Promise.all([
          listRecords("lessonDays"), listRecords("tasks"), listRecords("deadlines"),
          listRecords("materials"), listRecords("emails"), listRecords("districtCalendar"), listRecords("courses"),
        ]);
        setData({ lessonDays, tasks, deadlines, materials, emails, districtCalendar, courses });
      } catch (err) {
        console.error(err);
        setError("Could not load the dashboard.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const courseTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data.courses) map.set(c.id, (c.course as string) || "(course)");
    return (ids?: string[]) => (ids ?? []).map((id) => map.get(id)).filter(Boolean).join(", ");
  }, [data.courses]);

  const isDone = (s: unknown) => String(s ?? "").toLowerCase() === "done";
  const byDate = (a: TeachingRecord, b: TeachingRecord, key: string) =>
    String(a[key] ?? "9999").localeCompare(String(b[key] ?? "9999"));

  const teaching = useMemo(
    () => data.lessonDays
      .filter((l) => typeof l.date === "string" && l.date >= today && l.date <= weekAhead)
      .sort((a, b) => byDate(a, b, "date")),
    [data.lessonDays, today, weekAhead]
  );
  const scenarios = useMemo(
    () => data.lessonDays
      .filter((l) => Array.isArray(l.lessonType) && (l.lessonType as string[]).includes("Scenario / Simulation") &&
        typeof l.date === "string" && l.date >= today)
      .sort((a, b) => byDate(a, b, "date")),
    [data.lessonDays, today]
  );
  const tasks = useMemo(
    () => data.tasks.filter((t) => !isDone(t.status)).sort((a, b) => byDate(a, b, "dueDate")),
    [data.tasks]
  );
  const deadlines = useMemo(
    () => data.deadlines.filter((d) => !isDone(d.status)).sort((a, b) => byDate(a, b, "dueDate")),
    [data.deadlines]
  );
  const materials = useMemo(
    () => data.materials.filter((m) => !isDone(m.status)).sort((a, b) => byDate(a, b, "neededBy")),
    [data.materials]
  );
  const emails = useMemo(
    () => data.emails.filter((e) => !isDone(e.status)).sort((a, b) => byDate(a, b, "replyBy")),
    [data.emails]
  );
  const daysOff = useMemo(
    () => data.districtCalendar
      .filter((e) => typeof e.date === "string" && e.date >= today)
      .sort((a, b) => byDate(a, b, "date")),
    [data.districtCalendar, today]
  );

  // Stat tiles
  const lessonsToday = useMemo(() => teaching.filter((l) => l.date === today).length, [teaching, today]);
  const overdue = useMemo(
    () => [...tasks, ...deadlines].filter((r) => typeof r.dueDate === "string" && r.dueDate < today).length,
    [tasks, deadlines, today]
  );
  const dueThisWeek = useMemo(
    () => deadlines.filter((d) => typeof d.dueDate === "string" && d.dueDate >= today && d.dueDate <= weekAhead).length,
    [deadlines, today, weekAhead]
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const longDate = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/teaching" className="text-xs font-medium text-sky-600 hover:underline">← Teaching HQ</Link>
            <h1 className="text-2xl font-semibold tracking-tight">{greeting} ☀️</h1>
            <p className="text-sm text-slate-500">{longDate}</p>
          </div>
          <Link
            to="/teaching/calendar"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            📅 Calendar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-6 pb-12 pt-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}
        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {/* At-a-glance tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile value={lessonsToday} label="Lessons today" to="/teaching/calendar" tone={lessonsToday > 0 ? "warn" : "default"} />
          <Tile value={tasks.length} label="Open tasks" to="/teaching/db/tasks" />
          <Tile value={overdue} label="Overdue" to="/teaching/db/tasks" tone={overdue > 0 ? "danger" : "default"} />
          <Tile value={dueThisWeek} label="Due this week" to="/teaching/db/deadlines" />
        </div>

        {/* 1. Teaching */}
        <Section title="1. What am I teaching?" subtitle="Class meetings over the next 7 days." to="/teaching/calendar" empty={teaching.length === 0}>
          <ul className="divide-y divide-slate-100">
            {teaching.map((l) => (
              <li key={l.id} className={"flex items-start justify-between gap-3 py-2 " + (l.date === today ? "-mx-2 rounded-lg bg-amber-50 px-2" : "")}>
                <div>
                  <p className="font-medium text-slate-800">{(l.lesson as string) || "(untitled)"}</p>
                  <p className="text-xs text-slate-500">
                    {courseTitle(l.course as string[])}
                    {l.unitPhase ? ` · ${l.unitPhase}` : ""}
                    {(l.classActivity as string) ? ` · ${l.classActivity}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(l.lessonType as string[] | undefined)?.map((t) => (
                      <Chip key={t} fieldId="lessonType" type="lessonDays" value={t} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <DateLabel value={l.date} />
                  <Chip fieldId="prepStatus" type="lessonDays" value={l.prepStatus as string} />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Scenarios */}
        <Section title="🎬 Scenarios coming up" subtitle="Lesson days flagged Scenario / Simulation." to="/scenarios" empty={scenarios.length === 0}>
          <ul className="divide-y divide-slate-100">
            {scenarios.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-slate-800">{(l.lesson as string) || "(untitled)"}</p>
                  <p className="text-xs text-slate-500">{courseTitle(l.course as string[])}</p>
                </div>
                <DateLabel value={l.date} />
              </li>
            ))}
          </ul>
        </Section>

        {/* 2. Tasks */}
        <Section title="2. What has to get done?" subtitle="Open tasks, soonest due first." to="/teaching/db/tasks" empty={tasks.length === 0}>
          <ul className="divide-y divide-slate-100">
            {tasks.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip fieldId="priority" type="tasks" value={t.priority as string} />
                  <span className="font-medium text-slate-800">{(t.task as string) || "(untitled)"}</span>
                  <Chip fieldId="category" type="tasks" value={t.category as string} />
                </div>
                <DateLabel value={t.dueDate} done={isDone(t.status)} />
              </li>
            ))}
          </ul>
        </Section>

        {/* 3. Deadlines */}
        <Section title="3. What’s coming at me?" subtitle="Exams, check-offs, projects, and grade dates." to="/teaching/db/deadlines" empty={deadlines.length === 0}>
          <ul className="divide-y divide-slate-100">
            {deadlines.slice(0, 12).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip fieldId="type" type="deadlines" value={d.type as string} />
                  <span className="font-medium text-slate-800">{(d.assessment as string) || "(untitled)"}</span>
                  <span className="text-xs text-slate-500">{courseTitle(d.course as string[])}</span>
                </div>
                <DateLabel value={d.dueDate} done={isDone(d.status)} />
              </li>
            ))}
          </ul>
        </Section>

        {/* 4. Materials */}
        <Section title="4. What do I need to have ready?" subtitle="Equipment and consumables by the date needed." to="/teaching/db/materials" empty={materials.length === 0}>
          <ul className="divide-y divide-slate-100">
            {materials.slice(0, 12).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip fieldId="category" type="materials" value={m.category as string} />
                  <span className="font-medium text-slate-800">{(m.item as string) || "(untitled)"}</span>
                  <Chip fieldId="status" type="materials" value={m.status as string} />
                </div>
                <DateLabel value={m.neededBy} done={isDone(m.status)} />
              </li>
            ))}
          </ul>
        </Section>

        {/* 5. Emails */}
        <Section title="5. Who am I keeping waiting?" subtitle="Open threads that still need something from you." to="/teaching/db/emails" empty={emails.length === 0}>
          <ul className="divide-y divide-slate-100">
            {emails.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip fieldId="actionNeeded" type="emails" value={e.actionNeeded as string} />
                  <span className="font-medium text-slate-800">{(e.subject as string) || "(no subject)"}</span>
                  <span className="text-xs text-slate-500">{e.fromTo as string}</span>
                </div>
                <DateLabel value={e.replyBy} done={isDone(e.status)} />
              </li>
            ))}
          </ul>
        </Section>

        {/* Days off */}
        <Section title="📅 Upcoming days off" subtitle="Holidays, breaks, minimum days, and grade deadlines." to="/teaching/db/districtCalendar" empty={daysOff.length === 0}>
          <ul className="divide-y divide-slate-100">
            {daysOff.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip fieldId="type" type="districtCalendar" value={e.type as string} />
                  <span className="font-medium text-slate-800">{(e.event as string) || "(event)"}</span>
                </div>
                <DateLabel value={e.date} />
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}
