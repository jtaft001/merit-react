import { useState } from "react";
import type { FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value.trim();

    setStatus("Attempting login...");

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      setStatus("Login successful: " + userCred.user.email);
      // App listens to auth state and will switch to DashboardPage
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus("Login failed: " + message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-emerald-600 text-center text-lg font-bold leading-9 text-white">
              M
            </span>
            <div>
              <p className="text-sm font-semibold">MERIT · Medical Education Resource and Instruction Toolkit</p>
              <p className="text-xs text-slate-400">Scenario-based EMS learning for schools</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="rounded-lg border border-slate-700/70 bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
          >
            &larr; Back to Home
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow">
            <h1 className="text-2xl font-semibold text-white">Log in to your account</h1>
            <p className="mt-2 text-sm text-slate-300">Welcome back. Please log in to access your training scenarios.</p>

            <form
              onSubmit={handleSubmit}
              className="mt-6 space-y-4"
            >
              <input name="email" type="email" placeholder="Email" required autoComplete="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
              />
              <button type="submit"
                className="w-full rounded-lg border border-emerald-500/70 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
              >
                Log In
              </button>
            </form>

            {status && <p className="mt-4 text-sm text-center text-slate-400">{status}</p>}
        </div>
      </main>
    </div>
  );
}