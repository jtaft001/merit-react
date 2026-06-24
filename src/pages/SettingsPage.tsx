import { Link } from "react-router-dom";

const cards = [
  {
    to: "/settings/students",
    title: "Manage Students",
    desc: "Add students, assign classes, and drop students at year-end.",
  },
  {
    to: "/settings/classes",
    title: "Manage Classes",
    desc: "Create classes with meeting times, view by class, and archive at year-end.",
  },
  {
    to: "/settings/nfc-import",
    title: "NFC Card Import",
    desc: "Assign NFC sticker IDs to students via CSV.",
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-slate-500">
              Manage students, classes, and roster tools.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-12 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-400 hover:bg-sky-50"
            >
              <h2 className="text-base font-semibold text-slate-800">{c.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
