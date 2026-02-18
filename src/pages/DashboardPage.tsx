import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

type Props = {
  user: User;
};

export default function DashboardPage({ user }: Props) {
  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              MERIT EMS Dashboard
            </h1>
            <p className="text-xs text-slate-400">
              Welcome to your dashboard.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-xs font-medium text-slate-100">
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-sm transition hover:border-rose-500 hover:bg-rose-600 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <p>This is the dashboard page.</p>
      </main>
    </div>
  );
}
