import { Link } from "react-router-dom";
import { COLLECTIONS } from "../../teaching/schema";

export default function TeachingHQPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight">🏫 Teaching HQ</h1>
          <p className="text-sm text-slate-500">
            Your private command center — lesson plans, what you’re teaching, and scenarios coming up.
            Only you can see this.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 pb-12 pt-6">
        {/* Start here */}
        <Link
          to="/teaching/dashboard"
          className="block rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-5 shadow-sm transition hover:border-sky-400"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-sky-800">☀️ Daily Dashboard</h2>
              <p className="mt-1 text-sm text-slate-600">
                Start every morning here: what you’re teaching today, what’s due, what’s coming, and
                scenarios on deck.
              </p>
            </div>
            <span className="text-sm font-medium text-sky-600">Open →</span>
          </div>
        </Link>

        {/* Lesson calendar */}
        <Link
          to="/teaching/calendar"
          className="block rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5 shadow-sm transition hover:border-indigo-400"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-indigo-800">📅 Lesson Calendar</h2>
              <p className="mt-1 text-sm text-slate-600">
                Your lessons on a month grid — filter by course, click a day to plan or edit.
              </p>
            </div>
            <span className="text-sm font-medium text-indigo-600">Open →</span>
          </div>
        </Link>

        {/* This week's prep */}
        <Link
          to="/teaching/prep"
          className="block rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm transition hover:border-amber-400"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-amber-800">🧰 This Week's Prep</h2>
              <p className="mt-1 text-sm text-slate-600">
                Everything to copy, set up, and gather for the next 7 days — check it off as you go.
              </p>
            </div>
            <span className="text-sm font-medium text-amber-700">Open →</span>
          </div>
        </Link>

        {/* Databases */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Databases
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COLLECTIONS.map((c) => (
              <Link
                key={c.id}
                to={`/teaching/db/${c.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-400 hover:bg-sky-50"
              >
                <div className="text-2xl">{c.icon}</div>
                <h4 className="mt-2 text-base font-semibold text-slate-800">{c.label}</h4>
                <p className="mt-1 text-sm text-slate-500">{c.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
