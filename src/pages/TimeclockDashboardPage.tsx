import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit as limitClause,
  orderBy,
  query,
  Timestamp,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { fetchStudents, type StudentRecord } from "../services/studentService";

// Optional: static roster list (use student IDs/names from Firestore `students`).
// If populated, this takes priority over the fetched list for presence/absence counts.
const EXPECTED_STUDENT_IDS: string[] = [
  "Molly Anaya",
  "Elly Blair",
  "Jaiden Burrows",
  "Anakin Cook",
  "Violet Corona Barriga",
  "Bryce Davis",
  "Jacob Dixon",
  "Kimberly Eckman",
  "Josh Einhaus",
  "Olivia Frost",
  "Kyler Fry",
  "Kylie Gambill",
  "Brooke Gordon",
  "Elizabeth Hall",
  "Tru Herr",
  "Maia Herrera",
  "Jack Kegg",
  "Lily Kennefic",
  "Eva Knee",
  "Jayme Leeper",
  "Adelynn Massey",
  "Jasmine Mata",
  "Alexa Miland",
  "Des Miller",
  "Rylie Nelson",
  "Maya Ontiveros",
  "Izabella Petersen",
  "Alyssa Powell",
  "Justice Powell",
  "Bella Rice",
  "Maisie Roberts",
  "Tatiana Wilkes",
];

type LiveEvent = {
  id: string;
  studentId: string;
  action: string;
  timestamp: Date;
  source?: string;
};

function formatTs(d?: Date) {
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString();
}

type WindowInfo = { start: Date; end: Date; label: string } | null;

function startOfDay(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(base: Date) {
  const d = startOfDay(base);
  const day = d.getDay(); // 0 Sunday
  const diff = (day === 0 ? -6 : 1) - day; // start Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function getWindowForDate(date: Date): WindowInfo {
  const day = date.getDay(); // 0 Sun, 1 Mon
  if (day === 0 || day === 6) return null; // weekends

  const start = startOfDay(date);
  const end = startOfDay(date);
  if (day === 3) {
    // Wednesday
    start.setHours(13, 35, 0, 0);
    end.setHours(14, 31, 0, 0);
  } else {
    // Mon/Tue/Thu/Fri
    start.setHours(14, 23, 0, 0);
    end.setHours(15, 25, 0, 0);
  }
  return {
    start,
    end,
    label: `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  };
}

const colors = {
  forest: "#143821",
  gold: "#d2a52f",
  lightGold: "#e6c565",
  red: "#b3131b",
  teal: "#0ea5e9",
  greenText: "#0f2a1b",
};

function classifyLatest(action: string) {
  const a = (action || "").toUpperCase();
  if (a.includes("BREAK START")) return "break";
  if (a.includes("CLOCK OUT")) return "left";
  if (a.includes("CLOCK IN") || a.includes("BREAK END")) return "present";
  return "other";
}

export default function TimeclockDashboardPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string>("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const roster = useMemo(() => {
    if (EXPECTED_STUDENT_IDS.length > 0) {
      return EXPECTED_STUDENT_IDS.map((id) => ({ id, name: id })) as StudentRecord[];
    }
    return students;
  }, [students]);

  useEffect(() => {
    // Load students once
    void (async () => {
      try {
        const list = await fetchStudents();
        setStudents(list);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    const base = new Date();
    const weekStart = startOfWeek(base);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const q = query(
      collection(db, "timeclock"),
      where("timestamp", ">=", weekStart),
      where("timestamp", "<", weekEnd),
      orderBy("timestamp", "desc"),
      limitClause(1000)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LiveEvent[] = [];
        snap.forEach((doc) => {
          const data = doc.data();
          const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp);
          list.push({
            id: doc.id,
            studentId: data.studentId ?? "",
            action: data.action ?? "",
            timestamp: ts,
            source: data.source,
          });
        });
        setEvents(list);
        setStatus("ready");
      },
      (err) => {
        console.error(err);
        setError("Could not load events.");
        setStatus("error");
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const todayStatus = useMemo(() => {
    const base = startOfDay(new Date());
    const windowInfo = getWindowForDate(base);
    if (!windowInfo) {
      return {
        present: 0,
        onBreak: 0,
        left: 0,
        missing: roster.length,
        total: roster.length,
        windowLabel: "No class window (weekend)",
      };
    }
    const todayStr = base.toISOString().slice(0, 10);
    const byStudent = new Map<string, LiveEvent>();
    events.forEach((ev) => {
      const ds = ev.timestamp.toISOString().slice(0, 10);
      if (ds !== todayStr) return;
      if (ev.timestamp < windowInfo.start || ev.timestamp > windowInfo.end) return;
      const prev = byStudent.get(ev.studentId);
      if (!prev || ev.timestamp > prev.timestamp) {
        byStudent.set(ev.studentId, ev);
      }
    });

    let present = 0;
    let onBreak = 0;
    let left = 0;
    const total = roster.length;

    byStudent.forEach((ev) => {
      const status = classifyLatest(ev.action || "");
      if (status === "break") onBreak += 1;
      else if (status === "left") left += 1;
      else if (status === "present") present += 1;
    });
    const missing = Math.max(0, total - (present + onBreak + left));

    return { present, onBreak, left, missing, total, windowLabel: windowInfo.label };
  }, [events, roster]);

  const weekBars = useMemo(() => {
    const start = startOfWeek(new Date());
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i); // Mon-Fri only
      const key = d.toISOString().slice(0, 10);
      return { key, label: d.toLocaleDateString(undefined, { weekday: "short" }), date: d };
    });
    const presentPerDay: Record<string, Set<string>> = {};
    days.forEach((d) => {
      presentPerDay[d.key] = new Set();
    });
    events.forEach((ev) => {
      const key = ev.timestamp.toISOString().slice(0, 10);
      const dayInfo = days.find((d) => d.key === key);
      if (!dayInfo) return;
      const windowInfo = getWindowForDate(dayInfo.date);
      if (windowInfo && (ev.timestamp < windowInfo.start || ev.timestamp > windowInfo.end)) return;
      const action = (ev.action || "").toUpperCase();
      // Count as present if they clocked in, ended a break, started a break, or clocked out within window.
      if (
        action.includes("CLOCK IN") ||
        action.includes("BREAK END") ||
        action.includes("BREAK START") ||
        action.includes("CLOCK OUT")
      ) {
        presentPerDay[key].add(ev.studentId || "");
      }
    });
    const total = roster.length || 1;
    return days.map((d) => {
      const presentCount = presentPerDay[d.key].size;
      const absentCount = Math.max(0, total - presentCount);
      return { ...d, present: presentCount, absent: absentCount };
    });
  }, [events, roster]);

  const todayGroups = useMemo(() => {
    const base = startOfDay(new Date());
    const windowInfo = getWindowForDate(base);
    const todayStr = base.toISOString().slice(0, 10);
    const present: { name: string; time: Date }[] = [];
    const onBreak: { name: string; time: Date }[] = [];
    const left: { name: string; time: Date }[] = [];
    const missing: string[] = [];

    const latestToday = new Map<string, LiveEvent>();
    events.forEach((ev) => {
      const ds = ev.timestamp.toISOString().slice(0, 10);
      if (ds !== todayStr) return;
      if (windowInfo && (ev.timestamp < windowInfo.start || ev.timestamp > windowInfo.end)) return;
      const prev = latestToday.get(ev.studentId);
      if (!prev || ev.timestamp > prev.timestamp) {
        latestToday.set(ev.studentId, ev);
      }
    });

    roster.forEach((s) => {
      const ev = latestToday.get(s.id);
      if (!ev) {
        missing.push(s.name || s.email || s.id);
        return;
      }
      const displayName = s.name || s.email || s.id;
      const status = classifyLatest(ev.action || "");
      if (status === "break") onBreak.push({ name: displayName, time: ev.timestamp });
      else if (status === "left") left.push({ name: displayName, time: ev.timestamp });
      else if (status === "present") present.push({ name: displayName, time: ev.timestamp });
      else missing.push(displayName);
    });

    onBreak.sort((a, b) => b.time.getTime() - a.time.getTime());
    left.sort((a, b) => b.time.getTime() - a.time.getTime());
    present.sort((a, b) => b.time.getTime() - a.time.getTime());
    missing.sort((a, b) => a.localeCompare(b));

    return { present, onBreak, left, missing };
  }, [events, roster]);

  const breakDuration = (since?: Date) => {
    if (!since) return "";
    const mins = Math.floor((now - since.getTime()) / 60000);
    if (mins < 1) return "<1 min";
    if (mins === 1) return "1 min";
    return `${mins} mins`;
  };

  const pieData = useMemo(() => {
    const { present, onBreak, left = 0, missing, total } = todayStatus;
    const segments = [
      { label: "Present", value: present, color: "#22c55e" },
      { label: "On Break", value: onBreak, color: "#f59e0b" },
      { label: "Left", value: left, color: colors.teal },
      { label: "Absent", value: missing, color: "#94a3b8" },
    ].filter((s) => s.value > 0);
    const totalVal = segments.reduce((acc, s) => acc + s.value, 0);
    let cumulative = 0;
    const arcs = segments.map((s) => {
      const start = totalVal ? (cumulative / totalVal) * 360 : 0;
      cumulative += s.value;
      const end = totalVal ? (cumulative / totalVal) * 360 : 0;
      return { ...s, start, end };
    });
    return { segments: arcs, total };
  }, [todayStatus]);

  return (
    <div className="p-4 space-y-4">
      <div
        className="rounded-2xl shadow-sm border"
        style={{ borderColor: colors.forest, background: `linear-gradient(90deg, ${colors.forest}, ${colors.gold})` }}
      >
        <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "white" }}>
              Paradise HS · CTE Public Safety
            </h1>
            <p className="text-sm" style={{ color: colors.lightGold }}>
              Emergency Medical Services · 6th Period Timeclock
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.2)", color: "white" }}>
            {status === "loading" ? "Loading..." : `Events this week: ${events.length}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div
          className="rounded-2xl border shadow-sm p-4"
          style={{ borderColor: colors.forest, background: "white" }}
        >
          <h3 className="text-sm font-semibold mb-2" style={{ color: colors.forest }}>
            Today
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs font-medium">
            <div className="rounded-lg p-3" style={{ background: "#d6f3df", color: colors.forest }}>
              Present
              <div className="text-lg font-bold">{todayStatus.present}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#fdecc8", color: "#b45309" }}>
              On Break
              <div className="text-lg font-bold">{todayStatus.onBreak}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#dbeafe", color: colors.teal }}>
              Left
              <div className="text-lg font-bold">{todayStatus.left ?? 0}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#e2e8f0", color: colors.greenText }}>
              Absent
              <div className="text-lg font-bold">{todayStatus.missing}</div>
            </div>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: colors.greenText }}>
            Total students: {todayStatus.total}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="relative h-20 w-20 rounded-full"
              style={{
                background: pieData.segments.length
                  ? `conic-gradient(${pieData.segments
                      .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
                      .join(",")})`
                  : "#e2e8f0",
              }}
            >
              <div className="absolute inset-3 rounded-full bg-white flex items-center justify-center text-xs font-semibold text-slate-700">
                Today
              </div>
            </div>
            <div className="space-y-1 text-xs" style={{ color: colors.greenText }}>
              {pieData.segments.length === 0 && <div className="text-slate-500">No events yet today.</div>}
              {pieData.segments.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span>{s.label}</span>
                  <span className="text-slate-500">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl border shadow-sm p-4 lg:col-span-2"
          style={{ borderColor: colors.forest, background: "white" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: colors.forest }}>
              This week (Mon–Fri)
            </h3>
            <span className="text-xs" style={{ color: colors.greenText }}>
              Present vs Absent
            </span>
          </div>
          <div className="space-y-2">
            {weekBars.map((d) => {
              const total = (d.present || 0) + (d.absent || 0) || 1;
              const presentPct = Math.round((d.present / total) * 100);
              const absentPct = 100 - presentPct;
              return (
                <div key={d.key} className="space-y-1">
                  <div className="flex justify-between text-xs" style={{ color: colors.greenText }}>
                    <span>{d.label}</span>
                    <span>
                      {d.present} present / {d.absent} absent
                    </span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full text-[10px]" style={{ background: "#e2e8f0" }}>
                    <div
                      className="text-white text-center"
                      style={{ width: `${presentPct}%`, background: colors.forest }}
                      title="Present"
                    />
                    <div
                      className="text-white text-center"
                      style={{ width: `${absentPct}%`, background: "#94a3b8" }}
                      title="Absent"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border shadow-sm"
        style={{ borderColor: colors.forest, background: "white" }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-2"
          style={{ borderColor: colors.gold }}
        >
          <h2 className="text-sm font-semibold" style={{ color: colors.forest }}>
            Roster status (today&apos;s window)
          </h2>
          <span className="text-xs" style={{ color: colors.greenText }}>
            {todayStatus.windowLabel || "Today"}
          </span>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <div>
            <div
              className="rounded-lg p-2 text-sm font-semibold"
              style={{ background: "#d6f3df", color: colors.forest }}
            >
              Present Now ({todayGroups.present.length})
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-800">
              {todayGroups.present.length === 0 && <div className="text-slate-500">—</div>}
              {todayGroups.present.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between rounded-md border bg-white px-2 py-1"
                  style={{ borderColor: colors.gold }}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-slate-500">in @ {formatTs(p.time)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div
              className="rounded-lg p-2 text-sm font-semibold"
              style={{ background: "#fdecc8", color: "#b45309" }}
            >
              On Break ({todayGroups.onBreak.length})
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-800">
              {todayGroups.onBreak.length === 0 && <div className="text-slate-500">—</div>}
              {todayGroups.onBreak.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between rounded-md border bg-white px-2 py-1"
                  style={{ borderColor: colors.gold }}
                >
                  <span>{b.name}</span>
                  <span className="text-xs text-amber-700">on break {breakDuration(b.time)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div
              className="rounded-lg p-2 text-sm font-semibold"
              style={{ background: "#dbeafe", color: colors.teal }}
            >
              Left ({todayGroups.left.length})
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-800">
              {todayGroups.left.length === 0 && <div className="text-slate-500">—</div>}
              {todayGroups.left.map((l) => (
                <div
                  key={l.name}
                  className="flex items-center justify-between rounded-md border bg-white px-2 py-1"
                  style={{ borderColor: colors.gold }}
                >
                  <span>{l.name}</span>
                  <span className="text-xs text-slate-500">out @ {formatTs(l.time)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div
              className="rounded-lg p-2 text-sm font-semibold"
              style={{ background: "#e2e8f0", color: colors.greenText }}
            >
              Absent ({todayGroups.missing.length})
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-800">
              {todayGroups.missing.length === 0 && <div className="text-slate-500">—</div>}
              {todayGroups.missing.map((m) => (
                <div
                  key={m}
                  className="rounded-md border bg-white px-2 py-1"
                  style={{ borderColor: colors.gold }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
