import { useEffect, useMemo, useState } from "react";
import { fetchRecentEvents } from "../services/timeclockService";
import {
  fetchSessionsForStudent,
  fetchWarningsForStudent,
  type SessionRecord,
  type WarningRecord,
} from "../services/sessionsService";

type EventRecord = {
  id: string;
  studentId: string;
  timestamp: Date;
  action: string;
  source?: string;
};

function formatTs(d?: Date) {
  if (!d) return "";
  return d.toLocaleString();
}

export default function TimeclockPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState("");

  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoadingEvents(true);
        setEventsError("");
        const data = await fetchRecentEvents(14, 200);
        setEvents(data);
        if (!selectedStudent && data.length > 0) {
          setSelectedStudent(data[0].studentId || "");
        }
      } catch (err) {
        console.error(err);
        setEventsError("Could not load events.");
      } finally {
        setLoadingEvents(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadDetail() {
      if (!selectedStudent) {
        setSessions([]);
        setWarnings([]);
        return;
      }
      try {
        setLoadingDetail(true);
        setDetailError("");
        const [sess, warns] = await Promise.all([
          fetchSessionsForStudent(selectedStudent, 30, 200),
          fetchWarningsForStudent(selectedStudent, 30, 200),
        ]);
        setSessions(sess);
        setWarnings(warns);
      } catch (err) {
        console.error(err);
        setDetailError("Could not load sessions or warnings.");
      } finally {
        setLoadingDetail(false);
      }
    }
    void loadDetail();
  }, [selectedStudent]);

  const students = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((ev) => {
      if (ev.studentId) ids.add(ev.studentId);
    });
    return Array.from(ids).sort();
  }, [events]);

  const handleRefresh = async () => {
    try {
      setLoadingEvents(true);
      setEventsError("");
      const data = await fetchRecentEvents(14, 200);
      setEvents(data);
      if (data.length > 0 && !selectedStudent) {
        setSelectedStudent(data[0].studentId || "");
      }
    } catch (err) {
      console.error(err);
      setEventsError("Could not load events.");
    } finally {
      setLoadingEvents(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Timeclock</h1>
          <p className="text-sm text-slate-600">
            Recent raw events and derived sessions/warnings.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          disabled={loadingEvents}
        >
          {loadingEvents ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Recent Events</h2>
            <span className="text-xs text-slate-500">
              Last 14 days · {events.length} rows
            </span>
          </div>

          {eventsError && (
            <div className="px-4 py-2 text-sm text-rose-600">{eventsError}</div>
          )}

          {!eventsError && (
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Timestamp</th>
                    <th className="px-3 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr
                      key={ev.id}
                      className="hover:bg-slate-50"
                      onClick={() => setSelectedStudent(ev.studentId)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {ev.studentId || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{ev.action}</td>
                      <td className="px-3 py-2 text-slate-600">{formatTs(ev.timestamp)}</td>
                      <td className="px-3 py-2 text-slate-500">{ev.source || "—"}</td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-sm text-slate-500" colSpan={4}>
                        No events found in the last 14 days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Student Detail</h2>
            <div className="mt-2 space-y-2">
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select student</option>
                {students.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Loads sessions/warnings (30d) for the selected student.
              </p>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            {detailError && <div className="text-sm text-rose-600">{detailError}</div>}
            {loadingDetail && <div className="text-sm text-slate-500">Loading...</div>}

            {!loadingDetail && !detailError && (
              <>
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 uppercase">
                    Sessions (30d)
                  </h3>
                  <div className="mt-2 space-y-2 max-h-48 overflow-auto text-sm">
                    {sessions.length === 0 && (
                      <div className="text-slate-500">No sessions found.</div>
                    )}
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border border-slate-200 p-2 text-slate-700"
                      >
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{s.dateStr}</span>
                          <span>
                            Net:{" "}
                            {typeof s.netMs === "number"
                              ? `${(s.netMs / 1000 / 60).toFixed(1)} mins`
                              : "—"}
                          </span>
                        </div>
                        <div className="text-xs">
                          In: {formatTs(s.clockIn)} · Out: {formatTs(s.clockOut)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-700 uppercase">
                    Warnings (30d)
                  </h3>
                  <div className="mt-2 space-y-2 max-h-48 overflow-auto text-sm">
                    {warnings.length === 0 && (
                      <div className="text-slate-500">No warnings found.</div>
                    )}
                    {warnings.map((w) => (
                      <div
                        key={w.id}
                        className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800"
                      >
                        <div className="flex justify-between text-xs">
                          <span>{w.issue}</span>
                          <span className="text-amber-600">{w.dateStr}</span>
                        </div>
                        <div className="text-[11px] text-amber-700">
                          Start: {formatTs(w.startTs)} · End: {formatTs(w.endTs)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
