import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { COLOR_CLASSES, getCollection, optionColor, type Field } from "../../teaching/schema";
import { listRecords, type TeachingRecord } from "../../services/teachingService";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function longDate(s: string): string {
  const d = parse(s);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** Weekdays (Mon–Fri) of the week containing `anchor`. */
function weekdaysOf(anchor: string): string[] {
  const d = parse(anchor);
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7)); // back to Monday
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(ymd(x));
  }
  return out;
}

function Chip({ fieldKey, value }: { fieldKey: string; value?: string }) {
  if (!value) return null;
  const field = getCollection("lessonDays")?.fields.find((f) => f.key === fieldKey) as Field | undefined;
  const color = field ? optionColor(field, value) : "default";
  return (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + COLOR_CLASSES[color]}>{value}</span>
  );
}

export default function PrintPlanPage() {
  const { mode = "day", date = ymd(new Date()) } = useParams<{ mode: string; date: string }>();
  const [lessons, setLessons] = useState<TeachingRecord[]>([]);
  const [courses, setCourses] = useState<TeachingRecord[]>([]);
  const [plans, setPlans] = useState<TeachingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const dates = useMemo(() => (mode === "week" ? weekdaysOf(date) : [date]), [mode, date]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ls, cs, ps] = await Promise.all([
          listRecords("lessonDays"),
          listRecords("courses"),
          listRecords("lessonPlans"),
        ]);
        setLessons(ls);
        setCourses(cs);
        setPlans(ps);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const courseName = (ids?: string[]) =>
    (ids ?? []).map((id) => courses.find((c) => c.id === id)?.course as string | undefined).filter(Boolean).join(", ");
  const planFor = (ids?: string[]) => (ids ?? []).map((id) => plans.find((p) => p.id === id)).filter(Boolean) as TeachingRecord[];

  // date → lessons on that date, sorted by course name.
  const byDate = useMemo(() => {
    const map = new Map<string, TeachingRecord[]>();
    for (const d of dates) map.set(d, []);
    for (const l of lessons) {
      if (typeof l.date === "string" && map.has(l.date)) map.get(l.date)!.push(l);
    }
    for (const [, arr] of map) arr.sort((a, b) => courseName(a.course as string[]).localeCompare(courseName(b.course as string[])));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, dates, courses]);

  const heading =
    mode === "week"
      ? `Week of ${longDate(dates[0])} – ${parse(dates[4]).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
      : longDate(date);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Toolbar — hidden when printing */}
      <div className="border-b border-slate-200 bg-slate-50 print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link to="/teaching/calendar" className="text-sm font-medium text-sky-600 hover:underline">
            ← Calendar
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to={`/teaching/print/${mode === "week" ? "day" : "week"}/${date}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {mode === "week" ? "Single day" : "Whole week"}
            </Link>
            <button
              onClick={() => window.print()}
              className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              🖨 Print
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 py-6 print:px-0 print:py-0">
        <div className="mb-4 border-b border-slate-300 pb-3">
          <h1 className="text-2xl font-bold">Lesson Plan — {heading}</h1>
          <p className="text-sm text-slate-500">Paradise High School · Substitute / daily plan</p>
        </div>

        {loading && <p className="text-sm text-slate-500 print:hidden">Loading…</p>}

        {!loading && dates.every((d) => (byDate.get(d) ?? []).length === 0) && (
          <p className="text-sm italic text-slate-500">No lessons scheduled for this {mode}.</p>
        )}

        {dates.map((d) => {
          const dayLessons = byDate.get(d) ?? [];
          if (mode === "week" && dayLessons.length === 0) return null;
          return (
            <section key={d} className="mb-6 break-inside-avoid">
              {mode === "week" && <h2 className="mb-2 text-lg font-semibold text-slate-800">{longDate(d)}</h2>}
              {dayLessons.length === 0 ? (
                <p className="text-sm italic text-slate-500">No lessons scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {dayLessons.map((l) => {
                    const linkedPlans = planFor(l.lessonPlan as string[]);
                    return (
                      <div key={l.id} className="break-inside-avoid rounded-lg border border-slate-300 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{(l.lesson as string) || "(untitled)"}</h3>
                          <span className="text-sm font-medium text-slate-600">{courseName(l.course as string[])}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Chip fieldKey="phase" value={l.phase as string} />
                          {(l.lessonType as string[] | undefined)?.map((t) => (
                            <Chip key={t} fieldKey="lessonType" value={t} />
                          ))}
                          {l.copiesNeeded ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Copies needed</span>
                          ) : null}
                          {l.labSetupNeeded ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Lab setup</span>
                          ) : null}
                        </div>
                        {(l.bellRinger as string) && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                            <span className="font-semibold">🔔 Bell Work: </span>
                            {l.bellRinger as string}
                          </p>
                        )}
                        {(l.classActivity as string) && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                            <span className="font-semibold">Activity: </span>
                            {l.classActivity as string}
                          </p>
                        )}
                        {(l.preClassHomework as string) && (
                          <p className="mt-1 text-sm text-slate-700">
                            <span className="font-semibold">Homework: </span>
                            {l.preClassHomework as string}
                          </p>
                        )}
                        {(l.chaptersMedia as string) && (
                          <p className="mt-1 text-sm text-slate-700">
                            <span className="font-semibold">Materials: </span>
                            {l.chaptersMedia as string}
                          </p>
                        )}
                        {(l.exitTicket as string) && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                            <span className="font-semibold">🎟️ Exit Ticket: </span>
                            {l.exitTicket as string}
                          </p>
                        )}
                        {linkedPlans.length > 0 && (
                          <p className="mt-1 text-sm">
                            <span className="font-semibold text-slate-700">Plan: </span>
                            {linkedPlans.map((p, i) => (
                              <span key={p.id}>
                                {i > 0 && ", "}
                                <Link to={`/teaching/plan/${p.id}`} className="text-sky-600 hover:underline print:text-slate-700 print:no-underline">
                                  {(p.lessonPlan as string) || "(plan)"}
                                </Link>
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
