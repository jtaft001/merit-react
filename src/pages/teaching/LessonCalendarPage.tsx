import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { COLOR_CLASSES, getCollection, optionColor } from "../../teaching/schema";
import { listRecords, type TeachingRecord } from "../../services/teachingService";
import { RecordForm, loadRelations, type RelationMap } from "./RecordForm";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const lessonDef = getCollection("lessonDays");
const lessonTypeField = lessonDef?.fields.find((f) => f.key === "lessonType");

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Color a lesson by its first lesson-type tag (Scenario, Skills Lab, …). */
function lessonColor(lesson: TeachingRecord): string {
  const types = lesson.lessonType as string[] | undefined;
  const first = types?.[0];
  if (!first || !lessonTypeField) return COLOR_CLASSES.default;
  return COLOR_CLASSES[optionColor(lessonTypeField, first)];
}

export default function LessonCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [courseFilter, setCourseFilter] = useState("all");

  const [lessons, setLessons] = useState<TeachingRecord[]>([]);
  const [courses, setCourses] = useState<TeachingRecord[]>([]);
  const [relations, setRelations] = useState<RelationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal editor: undefined = closed, null = new (with defaults), record = edit.
  const [editing, setEditing] = useState<TeachingRecord | null | undefined>(undefined);
  const [newDefaults, setNewDefaults] = useState<Record<string, unknown>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ls, cs, rel] = await Promise.all([
        listRecords("lessonDays"),
        listRecords("courses"),
        lessonDef ? loadRelations(lessonDef) : Promise.resolve({} as RelationMap),
      ]);
      setLessons(ls);
      setCourses(cs);
      setRelations(rel);
    } catch (err) {
      console.error(err);
      setError("Could not load the calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const todayStr = dateStr(now.getFullYear(), now.getMonth(), now.getDate());

  // Lessons for the visible month, filtered by course, grouped by date string.
  const byDate = useMemo(() => {
    const map = new Map<string, TeachingRecord[]>();
    for (const l of lessons) {
      if (typeof l.date !== "string") continue;
      if (!l.date.startsWith(`${year}-${pad(month + 1)}`)) continue;
      if (courseFilter !== "all") {
        const ids = (l.course as string[] | undefined) ?? [];
        if (!ids.includes(courseFilter)) continue;
      }
      const arr = map.get(l.date) ?? [];
      arr.push(l);
      map.set(l.date, arr);
    }
    return map;
  }, [lessons, year, month, courseFilter]);

  // Build the month grid: leading blanks + each day, padded to full weeks.
  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  const courseTitle = (ids?: string[]) =>
    (ids ?? [])
      .map((id) => courses.find((c) => c.id === id)?.course as string | undefined)
      .filter(Boolean)
      .join(", ");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Link to="/teaching" className="text-xs font-medium text-sky-600 hover:underline">
              ← Teaching HQ
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">📅 Lesson Calendar</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500"
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.course as string) || "(course)"}
                </option>
              ))}
            </select>
            <Link
              to="/teaching/db/lessonDays"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Table view
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-6 pb-12 pt-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Month nav */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              ‹
            </button>
            <button onClick={goToday} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              Today
            </button>
            <button onClick={nextMonth} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              ›
            </button>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">
            {MONTHS[month]} {year}
          </h2>
          <span className="text-xs text-slate-400">{loading ? "Loading…" : `${lessons.length} lessons total`}</span>
        </div>

        {/* Calendar grid */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-24 border-b border-r border-slate-100 bg-slate-50/50" />;
              const ds = dateStr(year, month, day);
              const dayLessons = byDate.get(ds) ?? [];
              const isToday = ds === todayStr;
              return (
                <div key={i} className="group min-h-24 border-b border-r border-slate-100 p-1.5 align-top">
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                        (isToday ? "bg-sky-600 font-semibold text-white" : "text-slate-500")
                      }
                    >
                      {day}
                    </span>
                    <button
                      onClick={() => {
                        setNewDefaults({ date: ds });
                        setEditing(null);
                      }}
                      className="text-xs text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-sky-600"
                      title="Add lesson"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayLessons.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setEditing(l)}
                        className={"block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium hover:opacity-80 " + lessonColor(l)}
                        title={`${(l.lesson as string) || ""}${courseTitle(l.course as string[]) ? " · " + courseTitle(l.course as string[]) : ""}`}
                      >
                        {(l.lesson as string) || "(untitled)"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Click a lesson to edit it, or hover a day and click + to add one. Colors follow the lesson type.
        </p>
      </main>

      {/* Editor modal */}
      {editing !== undefined && lessonDef && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-auto bg-slate-900/40 p-4">
          <div className="mt-8 w-full max-w-3xl">
            <RecordForm
              def={lessonDef}
              initial={editing}
              defaults={newDefaults}
              relations={relations}
              onCancel={() => setEditing(undefined)}
              onSaved={() => {
                setEditing(undefined);
                void load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
