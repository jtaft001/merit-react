/**
 * NFC Kiosk Clock Page  (/nfc-login)
 *
 * This page lives on a dedicated kiosk tablet in the classroom.
 * A USB NFC reader is plugged in — when a student taps their ID card, the
 * reader acts like a keyboard and types the card's UID into the focused input,
 * then sends Enter.  No sticker programming required.
 *
 * Flow:
 *   IDLE  →  (card tapped)  →  LOOKING UP  →  ACTIONS  →  SUCCESS  →  IDLE
 *                                              (20s auto-logout or Done button)
 *                              ERROR  →  IDLE (4s)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// ─── Config ───────────────────────────────────────────────────────────────────

const AUTO_LOGOUT_SEC = 20;

const ACTIONS = [
  { label: "Clock In",  action: "CLOCK IN",    bg: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600" },
  { label: "Clock Out", action: "CLOCK OUT",   bg: "bg-rose-500   hover:bg-rose-400   active:bg-rose-600"   },
  { label: "Break Out", action: "BREAK START", bg: "bg-amber-500  hover:bg-amber-400  active:bg-amber-600"  },
  { label: "Break In",  action: "BREAK END",   bg: "bg-sky-500    hover:bg-sky-400    active:bg-sky-600"    },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "looking-up" | "actions" | "submitting" | "success" | "error";

type LookupResult  = { studentName: string };
type ClockResult   = { studentName: string; action: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function NfcClockPage() {
  const [phase,        setPhase]        = useState<Phase>("idle");
  const [nfcInput,     setNfcInput]     = useState("");
  const [nfcId,        setNfcId]        = useState("");          // resolved card ID
  const [studentName,  setStudentName]  = useState("");
  const [confirmedLabel, setConfirmedLabel] = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [countdown,    setCountdown]    = useState(AUTO_LOGOUT_SEC);

  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resetToIdle = useCallback(() => {
    stopTimer();
    setPhase("idle");
    setNfcInput("");
    setNfcId("");
    setStudentName("");
    setConfirmedLabel("");
    setErrorMsg("");
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

  // Start / stop countdown whenever phase changes
  useEffect(() => {
    if (phase === "actions" || phase === "success") {
      startCountdown();
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [phase, startCountdown]);

  // Keep input focused whenever we're on the idle screen
  useEffect(() => {
    if (phase === "idle") {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Step 1 — Card scanned: look up student ────────────────────────────────

  const handleCardScan = async (rawId: string) => {
    const trimmed = rawId.trim();
    if (!trimmed) return;

    setNfcId(trimmed);
    setNfcInput("");
    setPhase("looking-up");

    try {
      const fn = httpsCallable<{ nfcId: string }, LookupResult>(functions, "nfcLookup");
      const res = await fn({ nfcId: trimmed });
      setStudentName(res.data.studentName);
      setPhase("actions");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Card not recognised.";
      setErrorMsg(msg);
      setPhase("error");
      setTimeout(resetToIdle, 4000);
    }
  };

  // ── Step 2 — Action chosen: write timeclock event ─────────────────────────

  const handleAction = async (action: string, label: string) => {
    stopTimer();
    setPhase("submitting");

    try {
      const fn = httpsCallable<{ nfcId: string; action: string }, ClockResult>(
        functions, "nfcClock"
      );
      await fn({ nfcId, action });
      setConfirmedLabel(label);
      setPhase("success");           // countdown restarts via useEffect above
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(msg);
      setPhase("error");
      setTimeout(resetToIdle, 4000);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  // ── IDLE — kiosk standby ──────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-10 px-6 select-none">
        <div className="text-center space-y-2">
          <p className="text-slate-500 text-xs font-semibold tracking-[0.25em] uppercase">
            MERIT EMS
          </p>
          <h1 className="text-white text-5xl font-bold">Time Clock</h1>
          <p className="text-slate-400 text-xl">Tap your ID card to begin</p>
        </div>

        {/*
          Hidden-ish input — always focused so the USB NFC reader can type
          the card UID directly into it.  We keep it subtle; the reader sends
          Enter automatically so the student doesn't have to touch anything.
        */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleCardScan(nfcInput); }}
          className="w-full max-w-xs space-y-3"
        >
          <input
            ref={inputRef}
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
          {/* Visible submit for manual entry / testing without a reader */}
          <button
            type="submit"
            className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600
              text-slate-300 font-semibold text-sm transition-colors"
          >
            Submit ID manually
          </button>
        </form>

        <p className="text-slate-700 text-xs">
          Connect a USB NFC reader — cards tap automatically
        </p>
      </div>
    );
  }

  // ── LOOKING UP / SUBMITTING — spinner ────────────────────────────────────
  if (phase === "looking-up" || phase === "submitting") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-sky-400 animate-spin" />
        <p className="text-slate-400 text-lg">
          {phase === "looking-up" ? "Reading card…" : "Recording…"}
        </p>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 text-center px-8">
        <span className="text-rose-400 text-8xl leading-none">✗</span>
        <p className="text-rose-300 text-2xl font-semibold">{errorMsg}</p>
        <p className="text-slate-500 text-sm">Returning to home screen…</p>
      </div>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (phase === "success") {
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

  // ── ACTIONS — choose clock action ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 px-6">
      {/* Student identity */}
      <div className="text-center space-y-1">
        <p className="text-slate-500 text-xs font-semibold tracking-[0.2em] uppercase">
          MERIT EMS · Time Clock
        </p>
        <h2 className="text-white text-4xl font-bold">{studentName}</h2>
        <p className="text-slate-400 text-base">Select an action</p>
      </div>

      {/* 2 × 2 action grid */}
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

      {/* Countdown + logout */}
      <div className="flex flex-col items-center gap-2">
        <CountdownRing value={countdown} max={AUTO_LOGOUT_SEC} />
        <p className="text-slate-500 text-xs">
          Auto-logout in{" "}
          <span className="text-slate-400 font-semibold">{countdown}s</span>
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

// ─── Countdown ring sub-component ─────────────────────────────────────────────

function CountdownRing({ value, max }: { value: number; max: number }) {
  const r = 24;
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
