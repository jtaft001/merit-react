import { Link } from "react-router-dom";

export default function TimeAttendancePage() {
  return (
    <div className="p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
        <h1 className="text-lg font-semibold text-slate-900">Time &amp; Attendance</h1>
        <p className="text-sm text-slate-600 mt-1">
          Choose a view to manage attendance and live timeclock data.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            to="/timeclock"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:border-sky-500 hover:bg-sky-50"
          >
            Timeclock (events &amp; sessions)
          </Link>
          <Link
            to="/timeclock-live"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:border-sky-500 hover:bg-sky-50"
          >
            Timeclock Live (dashboard)
          </Link>
          <Link
            to="/payroll"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:border-sky-500 hover:bg-sky-50"
          >
            Payroll (coming soon)
          </Link>
        </div>
      </div>
    </div>
  );
}
