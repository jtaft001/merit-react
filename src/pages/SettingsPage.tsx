import { Link } from "react-router-dom";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Settings
            </h1>
            <p className="text-xs text-slate-400">
              Manage your account settings.
            </p>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <div className="space-y-4">
          <Link
            to="/settings/add-user"
            className="block rounded-md border border-slate-700 bg-slate-800 px-4 py-3 text-white hover:bg-slate-700"
          >
            Add New User
          </Link>
        </div>
      </main>
    </div>
  );
}
