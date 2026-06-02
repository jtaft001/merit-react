/**
 * Combined Kiosk Login Screen  (/login)
 *
 * Two panels when idle:
 *   Left  — NFC Time Clock: USB reader types card UID + Enter into the hidden
 *            input, triggering the clock-in/out flow.
 *   Right — Staff Login: email/password to reach the admin dashboard.
 *
 * NFC flow (non-idle phases) takes over the full screen, then resets here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { httpsCallable } from "firebase/functions";
import { signInWithEmailAndPassword } from "firebase/auth";
import { functions, auth } from "./firebase";

// ─── Config ───────────────────────────────────────────────────────────────────

const AUTO_LOGOUT_SEC = 20;

const ACTIONS = [
  { label: "Clock In",  action: "CLOCK IN",    bg: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600" },
  { label: "Clock Out", action: "CLOCK OUT",   bg: "bg-rose-500   hover:bg-rose-400   active:bg-rose-600"   },
  { label: "Break Out", action: "BREAK START", bg: "bg-amber-500  hover:bg-amber-400  active:bg-amber-600"  },
  { label: "Break In",  action: "BREAK END",   bg: "bg-sky-500    hover:bg-sky-400    active:bg-sky-600"    },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type NfcPhase = "idle" | "looking-up" | "actions" | "submitting" | "success" | "error";
type LookupResult = { studentName: string };
type ClockResult  = { studentName: string; action: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  // NFC state
  const [nfcPhase,        setNfcPhase]       = useState<NfcPhase>("idle");
  const [nfcInput,        setNfcInput]        = useState("");
  const [nfcId,           setNfcId]           = useState("");
  const [studentName,     setStudentName]     = useState("");
  const [confirmedLabel,  setConfirmedLabel]  = useState("");
  const [nfcError,        setNfcError]        = useState("");
  const [countdown,       setCountdown]       = useState(AUTO_LOGOUT_SEC);

  // Staff login state
  const [loginStatus,     setLoginStatus]     = useState("");
  const [loginFocused,    setLoginFocused]    = useState(false);

  const nfcInputRef = useRef<HTMLInputElement>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer helpers ─────────────────────────────────────────────────────────

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resetToIdle = useCallback(() => {
    stopTimer();
    setNfcPhase("idle");
    setNfcInput("");
    setNfcId("");
    setStudentName("");
    setConfirmedLabel("");
    setNfcError("");
    setCountdown(AUTO_LOGOUT_SEC);
  }, []);

  const startCountdown = useCallback(() => {
    stopTimer();
    setCountdown(AUTO_LOGOUT_SEC);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { resetToIdle(); return AUTO_LOGOUT_SEC; }
        return prev - 1;
      });
    }, 1000);
  }, [resetToIdle]);

  useEffect(() => {
    if (nfcPhase === "actions" || nfcPhase === "success") {
      startCountdown();
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [nfcPhase, startCountdown]);

  // Keep NFC input focused during idle, unless staff login form is active
  useEffect(() => {
    if (nfcPhase === "idle" && !loginFocused) {
      const t = setTimeout(() => nfcInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [nfcPhase, loginFocused]);

  // ── NFC handlers ──────────────────────────────────────────────────────────

  const handleCardScan = async (rawId: string) => {
    const trimmed = rawId.trim();
    if (!trimmed) return;

    setNfcId(trimmed);
    setNfcInput("");
    setNfcPhase("looking-up");

    try {
      const fn = httpsCallable<{ nfcId: string }, LookupResult>(functions, "nfcLookup");
      const res = await fn({ nfcId: trimmed });
      setStudentName(res.data.studentName);
      setNfcPhase("actions");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Card not recognised.";
      setNfcError(msg);
      setNfcPhase("error");
      setTimeout(resetToIdle, 4000);
    }
  };

  const handleAction = async (action: string, label: string) => {
    stopTimer();
    setNfcPhase("submitting");

    try {
      const fn = httpsCallable<{ nfcId: string; action: string }, ClockResult>(functions, "nfcClock");
      await fn({ nfcId, action });
      setConfirmedLabel(label);
      setNfcPhase("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setNfcError(msg);
      setNfcPhase("error");
      setTimeout(resetToIdle, 4000);
    }
  };

  // ── Staff login handler ───────────────────────────────────────────────────

  async function handleStaffLogin(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email    = (form.elements.namedItem("email")    as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value.trim();

    setLoginStatus("Signing in…");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // App.tsx auth listener detects the new user and redirects to the dashboard
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setLoginStatus(msg);
    }
  }

  // ─── Full-screen NFC phases ───────────────────────────────────────────────

  if (nfcPhase === "looking-up" || nfcPhase === "submitting") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-sky-400 animate-spin" />
        <p className="text-slate-400 text-lg">
          {nfcPhase === "looking-up" ? "Reading card…" : "Recording…"}
        </p>
      </div>
    );
  }

  if (nfcPhase === "error") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 text-center px-8">
        <span className="text-rose-400 text-8xl leading-none">✗</span>
        <p className="text-rose-300 text-2xl font-semibold">{nfcError}</p>
        <p className="text-slate-500 text-sm">Returning to home screen…</p>
      </div>
    );
  }

  if (nfcPhase === "success") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 text-center px-6">
        <span className="text-emerald-400 text-9xl leading-none select-none">✓</span>
        <p className="text-white text-4xl font-bold">{studentName}</p>
        <p className="text-slate-300 text-2xl">{confirmedLabel} recorded</p>

        <div className="flex flex-col items-center gap-3 mt-6">
          <CountdownRing value={countdown} max={AUTO_LOGOUT_SEC} />
          <p className="text-slate-500 text-sm">
            Auto-logout in <span className="text-slate-300 font-semibold">{countdown}s</span>
          </p>
          <button
            onClick={resetToIdle}
            className="mt-2 px-10 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600
              active:bg-slate-800 text-white font-bold text-lg transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  if (nfcPhase === "actions") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-center space-y-1">
          <p className="text-slate-500 text-xs font-semibold tracking-[0.2em] uppercase">
            MERIT EMS · Time Clock
          </p>
          <h2 className="text-white text-4xl font-bold">{studentName}</h2>
          <p className="text-slate-400 text-base">Select an action</p>
        </div>

        <div className="grid grid-cols-2 gap-5 w-full max-w-xs">
          {ACTIONS.map(({ label, action, bg }) => (
            <button
              key={action}
              onClick={() => handleAction(action, label)}
              className={`${bg} text-white font-bold text-xl py-10 rounded-3xl
                transition-all active:scale-95 shadow-lg`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <CountdownRing value={countdown} max={AUTO_LOGOUT_SEC} />
          <p className="text-slate-500 text-xs">
            Auto-logout in <span className="text-slate-400 font-semibold">{countdown}s</span>
          </p>
          <button
            onClick={resetToIdle}
            className="mt-1 px-7 py-2 rounded-xl bg-slate-700 hover:bg-slate-600
              active:bg-slate-800 text-slate-200 font-semibold text-sm transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // ─── IDLE — Combined kiosk screen ────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col select-none">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-3 shrink-0">
        <span className="h-9 w-9 rounded-xl bg-emerald-600 text-center text-lg font-bold leading-9 text-white shrink-0">
          M
        </span>
        <div>
          <p className="text-sm font-semibold text-white">MERIT EMS</p>
          <p className="text-xs text-slate-400">Medical Education Resource and Instruction Toolkit</p>
        </div>
      </header>

      {/* Two panels */}
      <div className="flex-1 flex flex-col md:flex-row">

        {/* ── Left: NFC Time Clock ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 py-12
          border-b border-slate-800 md:border-b-0 md:border-r md:border-slate-800">

          {/* NFC icon + heading */}
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-28 h-28 rounded-full bg-slate-800 border-2 border-slate-700
              flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-14 h-14 text-sky-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808
                    9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152
                    0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"
                />
              </svg>
            </div>

            <div>
              <h1 className="text-white text-3xl font-bold">Student Time Clock</h1>
              <p className="text-slate-400 text-lg mt-1">Tap your NFC card to begin</p>
            </div>
          </div>

          {/* Hidden NFC input — USB reader types here */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleCardScan(nfcInput); }}
            className="w-full max-w-xs space-y-3"
          >
            <input
              ref={nfcInputRef}
              type="text"
              value={nfcInput}
              onChange={(e) => setNfcInput(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Waiting for card…"
              className="w-full rounded-2xl bg-slate-800 border border-slate-700
                text-white text-center text-base px-4 py-4
                focus:outline-none focus:ring-2 focus:ring-sky-500
                placeholder:text-slate-600 caret-sky-400 tracking-widest"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600
                text-slate-300 font-semibold text-sm transition-colors"
            >
              Enter ID manually
            </button>
          </form>

          <p className="text-slate-700 text-xs text-center">
            USB NFC reader — cards tap automatically
          </p>
        </div>

        {/* ── Right: Staff Login ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 py-12">
          <div className="text-center">
            <h2 className="text-white text-2xl font-bold">Staff Login</h2>
            <p className="text-slate-400 text-sm mt-1">
              Sign in to access the admin dashboard
            </p>
          </div>

          <form
            onSubmit={handleStaffLogin}
            onFocus={() => setLoginFocused(true)}
            onBlur={(e) => {
              if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
                setLoginFocused(false);
              }
            }}
            className="w-full max-w-sm space-y-4 select-text"
          >
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3
                text-sm text-white placeholder-slate-400
                focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3
                text-sm text-white placeholder-slate-400
                focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-3
                text-sm font-semibold text-white transition-colors"
            >
              Log In
            </button>

            {loginStatus && (
              <p className="text-center text-sm text-slate-400">{loginStatus}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Countdown ring ───────────────────────────────────────────────────────────

function CountdownRing({ value, max }: { value: number; max: number }) {
  const r    = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / max);

  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r}
          fill="none"
          stroke="#64748b"
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center
        text-slate-400 text-sm font-bold">
        {value}
      </span>
    </div>
  );
}
