import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COLOR_CLASSES,
  getCollection,
  optionColor,
  type Field,
} from "../../teaching/schema";
import { listRecords, type TeachingRecord } from "../../services/teachingService";

/** Local today as YYYY-MM-DD (dates are stored date-only, so string compare works). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekAheadStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  const d = new Date(`${v}T00:00`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function Chip({ fieldId, type, value }: { fieldId: string; type: string; value?: string }) {
  if (!value) return null;
  const def = getCollection(type);
  const field = def?.fields.find((f) => f.key === fieldId) as Field | undefined;
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
  lessonDays: [],
  tasks: [],
  deadlines: [],
  materials: [],
  emails: [],
  districtCalendar: [],
  courses: [],
};

function Section({
  title,
  subtitle,
  to,
  children,
  empty,
  count,
}: {
  title: string;
  subtitle: string;
  to: string;
  children: React.ReactNode;
  empty: boolean;
  count?: number;
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
        {empty ? (
          <p className="text-sm italic text-slate-400">Nothing here — you’re in good shape.</p>
        ) : (
          children
        )}
      </div>
      {count !== undefined && count > 0 && (
        <p className="mt-2 text-xs text-slate-400">{count} total</p>
      )}
    </section>
  );
}

export default function DailyDashboardPage() {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = todayStr();
  const weekAhead = weekAheadStr();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [lessonDays, tasks, deadlines, materials, emails, districtCalendar, courses] =
          await Promise.all([
            listRecords("lessonDays"),
            listRecords("tasks"),
            listRecords("deadlines"),
            listRecords("materials"),
            listRecords("emails"),
            listRecords("districtCalendar"),
            listRecords("courses"),
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

  // 1. Teaching this week (today → +7d)
  const teaching = useMemo(
    () =>
      data.lessonDays
        .filter((l) => typeof l.date === "string" && l.date >= today && l.date <= weekAhead)
        .sort((a, b) => byDate(a, b, "date")),
    [data.lessonDays, today, weekAhead]
  );

  // Scenarios coming up (Scenario / Simulation, today onward)
  const scenarios = useMemo(
    () =>
      data.lessonDays
        .filter(
          (l) =>
            Array.isArray(l.lessonType) &&
            (l.lessonType as string[]).includes("Scenario / Simulation") &&
            typeof l.date === "string" &&
            l.date >= today
        )
        .sort((a, b) => byDate(a, b, "date")),
    [data.lessonDays, today]
  );

  // 2. Urgent/High tasks not done
  const tasks = useMemo(
    () =>
      data.tasks
        .filter((t) => !isDone(t.status) && ["Urgent", "High"].includes(String(t.priority)))
        .sort((a, b) => byDate(a, b, "dueDate")),
    [data.tasks]
  );

  // 3. Upcoming deadlines not done
  const deadlines = useMemo(
    () =>
      data.deadlines
        .filter((d) => !isDone(d.status))
        .sort((a, b) => byDate(a, b, "dueDate"))
        .slice(0, 10),
    [data.deadlines]
  );

  // 4. Materials to prep
  const materials = useMemo(
    () =>
      data.materials
        .filter((m) => !isDone(m.status))
        .sort((a, b) => byDate(a, b, "neededBy"))
        .slice(0, 10),
    [data.materials]
  );

  // 5. Emails waiting
  const emails = useMemo(
    () => data.emails.filter((e) => !isDone(e.status)).sort((a, b) => byDate(a, b, "replyBy")),
    [data.emails]
  );

  // Upcoming days off
  const daysOff = useMemo(
    () =>
      data.districtCalendar
        .filter((e) => typeof e.date === "string" && e.date >= today)
        .sort((a, b) => byDate(a, b, "date"))
        .slice(0, 6),
    [data.districtCalendar, today]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/teaching" className="text-xs font-medium text-sky-600 hover:underline">
              ← Teaching HQ
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">☀️ Daily Dashboard</h1>
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-6 pb-12 pt-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}
        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {/* 1. Teaching */}
        <Section
          title="1. What am I teaching?"
          subtitle="Class meetings over the next 7 days."
          to="/teaching/db/lessonDays"
          empty={teaching.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {teaching.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
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
                <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                  <span className="text-xs font-medium text-slate-600">{fmt(l.date)}</span>
                  <Chip fieldId="prepStatus" type="lessonDays" value={l.prepStatus as string} />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Scenarios coming up */}
        <Section
          title="🎬 Scenarios coming up"
          subtitle="Lesson days flagged Scenario / Simulation. Ties into your scenario library."
          to="/scenarios"
          empty={scenarios.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {scenarios.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-slate-800">{(l.lesson as string) || "(untitled)"}</p>
                  <p className="text-xs text-slate-500">{courseTitle(l.course as string[])}</p>
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(l.date)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 2. Tasks */}
        <Section
          title="2. What has to get done?"
          subtitle="Urgent and high-priority tasks, soonest first."
          to="/teaching/db/tasks"
          empty={tasks.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  <Chip fieldId="priority" type="tasks" value={t.priority as string} />
                  <span className="font-medium text-slate-800">{(t.task as string) || "(untitled)"}</span>
                  <Chip fieldId="category" type="tasks" value={t.category as string} />
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(t.dueDate)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 3. Deadlines */}
        <Section
          title="3. What’s coming at me?"
          subtitle="Every exam, check-off, project, and grade date, soonest first."
          to="/teaching/db/deadlines"
          empty={deadlines.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {deadlines.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  <Chip fieldId="type" type="deadlines" value={d.type as string} />
                  <span className="font-medium text-slate-800">{(d.assessment as string) || "(untitled)"}</span>
                  <span className="text-xs text-slate-500">{courseTitle(d.course as string[])}</span>
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(d.dueDate)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 4. Materials */}
        <Section
          title="4. What do I need to have ready?"
          subtitle="Equipment and consumables by the date they’re needed."
          to="/teaching/db/materials"
          empty={materials.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  <Chip fieldId="category" type="materials" value={m.category as string} />
                  <span className="font-medium text-slate-800">{(m.item as string) || "(untitled)"}</span>
                  <Chip fieldId="status" type="materials" value={m.status as string} />
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(m.neededBy)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 5. Emails */}
        <Section
          title="5. Who am I keeping waiting?"
          subtitle="Open email threads that still need something from you."
          to="/teaching/db/emails"
          empty={emails.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {emails.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  <Chip fieldId="actionNeeded" type="emails" value={e.actionNeeded as string} />
                  <span className="font-medium text-slate-800">{(e.subject as string) || "(no subject)"}</span>
                  <span className="text-xs text-slate-500">{e.fromTo as string}</span>
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(e.replyBy)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Days off */}
        <Section
          title="📅 Upcoming days off"
          subtitle="Holidays, breaks, minimum days, and grade deadlines. Check before planning a lab."
          to="/teaching/db/districtCalendar"
          empty={daysOff.length === 0}
        >
          <ul className="divide-y divide-slate-100">
            {daysOff.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  <Chip fieldId="type" type="districtCalendar" value={e.type as string} />
                  <span className="font-medium text-slate-800">{(e.event as string) || "(event)"}</span>
                </div>
                <span className="text-xs font-medium text-slate-600">{fmt(e.date)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}
