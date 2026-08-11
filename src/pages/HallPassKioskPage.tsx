import { useCallback, useEffect, useRef, useState } from "react";
import {
  hallPassLookup,
  hallPassCheckout,
  hallPassReturn,
  type LookupResult,
} from "../services/hallPassService";

type Phase = "idle" | "looking-up" | "identity" | "destination" | "confirm" | "blocked" | "done" | "error";

const DESTINATIONS = [
  { key: "restroom", label: "Restroom", icon: "🚻" },
  { key: "water", label: "Water", icon: "💧" },
  { key: "nurse", label: "Nurse", icon: "🩺" },
  { key: "office", label: "Office", icon: "🏫" },
  { key: "counselor", label: "Counselor", icon: "💬" },
];

const IDLE_RESET_SEC = 25;

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function HallPassKioskPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pin, setPin] = useState("");
  const [student, setStudent] = useState<LookupResult | null>(null);
  const [destination, setDestination] = useState<{ key: string; label: string; exempt: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setPin("");
    setStudent(null);
    setDestination(null);
    setMessage("");
    setBusy(false);
  }, []);

  // Auto-return to idle after inactivity on any non-idle screen.
  useEffect(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (phase === "idle") return;
    const secs = phase === "done" || phase === "error" ? 5 : IDLE_RESET_SEC;
    resetTimer.current = setTimeout(reset, secs * 1000);
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, [phase, reset]);

  async function submitPin() {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setPhase("looking-up");
    try {
      const res = await hallPassLookup({ studentIdNumber: pin.trim() });
      setStudent(res);
      setPhase("identity");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "ID not found.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function pickDestination(d: { key: string; label: string }) {
    if (!student) return;
    const exempt = student.exemptDestinations.map((x) => x.toLowerCase()).includes(d.key);
    setDestination({ ...d, exempt });
    if (!exempt && student.passesRemaining <= 0) { setPhase("blocked"); return; }
    if (exempt) { void doCheckout({ ...d, exempt }); return; } // no confirm needed for exempt
    setPhase("confirm");
  }

  async function doCheckout(d: { key: string; label: string; exempt: boolean }) {
    if (!student || busy) return;
    setBusy(true);
    try {
      const res = await hallPassCheckout({ studentDocId: student.studentDocId, destination: d.key });
      setMessage(res.exempt ? `You're checked out to the ${d.label.toLowerCase()}. (No pass used.)` : `You're checked out. ${res.passesRemaining} passes left.`);
      setPhase("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not check out.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function doReturn() {
    if (!student || busy) return;
    setBusy(true);
    try {
      await hallPassReturn({ studentDocId: student.studentDocId });
      setMessage("Welcome back! You're marked in.");
      setPhase("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not mark you back.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-50">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Hall Pass</h1>
          <p className="text-sm text-slate-400">Paradise HS Public Safety</p>
        </div>

        {/* IDLE — keypad */}
        {phase === "idle" && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <p className="mb-3 text-center text-lg font-medium text-slate-200">Enter your student ID</p>
            <div className="mb-4 flex h-14 items-center justify-center rounded-xl bg-slate-950 text-3xl font-mono tracking-[0.3em] text-emerald-400">
              {pin ? "•".repeat(pin.length) : <span className="text-slate-600">— — —</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map((n) => (
                <button key={n} onClick={() => setPin((p) => (p.length < 12 ? p + n : p))}
                  className="rounded-2xl bg-slate-800 py-5 text-2xl font-semibold active:bg-slate-700">{n}</button>
              ))}
              <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-2xl bg-slate-800 py-5 text-xl active:bg-slate-700">⌫</button>
              <button onClick={() => setPin((p) => (p.length < 12 ? p + "0" : p))} className="rounded-2xl bg-slate-800 py-5 text-2xl font-semibold active:bg-slate-700">0</button>
              <button onClick={submitPin} disabled={!pin} className="rounded-2xl bg-emerald-500 py-5 text-lg font-bold text-emerald-950 active:bg-emerald-400 disabled:opacity-40">Enter</button>
            </div>
          </div>
        )}

        {phase === "looking-up" && <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center text-lg text-slate-300">Looking you up…</div>}

        {/* IDENTITY confirm */}
        {phase === "identity" && student && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt="" className="mx-auto mb-3 h-24 w-24 rounded-full object-cover" />
            ) : (
              <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 text-3xl font-bold text-emerald-400">{initials(student.studentName)}</div>
            )}
            <h2 className="text-2xl font-bold">{student.studentName}</h2>
            {student.period && <p className="text-sm text-slate-400">{student.period}</p>}

            {student.currentlyOut ? (
              <>
                <p className="mt-4 text-amber-300">You're currently out.</p>
                <button onClick={doReturn} disabled={busy} className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold text-emerald-950 active:bg-emerald-400 disabled:opacity-50">I'm back</button>
                <button onClick={reset} className="mt-2 w-full rounded-2xl bg-slate-800 py-3 text-slate-300">Not me</button>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <div className="mb-1 flex justify-center gap-1.5">
                    {Array.from({ length: student.passesPerSemester }).map((_, i) => (
                      <span key={i} className={"h-3 w-8 rounded-full " + (i < student.passesRemaining ? "bg-emerald-400" : "bg-slate-700")} />
                    ))}
                  </div>
                  <p className="text-sm text-slate-400">{student.passesRemaining} of {student.passesPerSemester} passes left</p>
                </div>
                <button onClick={() => setPhase("destination")} className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold text-emerald-950 active:bg-emerald-400">Yes, that's me</button>
                <button onClick={reset} className="mt-2 w-full rounded-2xl bg-slate-800 py-3 text-slate-300">Not me</button>
              </>
            )}
          </div>
        )}

        {/* DESTINATION picker */}
        {phase === "destination" && student && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <p className="mb-4 text-center text-lg font-medium">Where are you going?</p>
            <div className="grid grid-cols-2 gap-3">
              {DESTINATIONS.map((d) => {
                const exempt = student.exemptDestinations.map((x) => x.toLowerCase()).includes(d.key);
                return (
                  <button key={d.key} onClick={() => pickDestination(d)}
                    className="flex flex-col items-center gap-1 rounded-2xl bg-slate-800 py-5 active:bg-slate-700">
                    <span className="text-3xl">{d.icon}</span>
                    <span className="text-base font-semibold">{d.label}</span>
                    {exempt && <span className="text-[0.65rem] font-medium text-sky-300">doesn't use a pass</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={reset} className="mt-4 w-full rounded-2xl bg-slate-800 py-3 text-slate-300">Cancel</button>
          </div>
        )}

        {/* CONFIRM (non-exempt) */}
        {phase === "confirm" && student && destination && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
            <p className="text-xl font-semibold">Use 1 of your {student.passesRemaining} passes?</p>
            <p className="mt-1 text-slate-400">Going to the {destination.label.toLowerCase()}</p>
            <p className="mt-4 rounded-xl bg-slate-950 px-3 py-2 text-sm text-emerald-300">Unused passes are worth {student.pointsPerUnusedPass} points each at semester's end.</p>
            <button onClick={() => doCheckout(destination)} disabled={busy} className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold text-emerald-950 active:bg-emerald-400 disabled:opacity-50">Yes, check me out</button>
            <button onClick={() => setPhase("destination")} className="mt-2 w-full rounded-2xl bg-slate-800 py-3 text-slate-300">Back</button>
          </div>
        )}

        {/* BLOCKED — out of passes */}
        {phase === "blocked" && (
          <div className="rounded-3xl border border-rose-900 bg-rose-950/40 p-8 text-center shadow-xl">
            <div className="text-5xl">🛑</div>
            <p className="mt-3 text-xl font-bold text-rose-200">You're out of passes</p>
            <p className="mt-1 text-rose-300/80">Ask your teacher for an override.</p>
            <button onClick={reset} className="mt-6 w-full rounded-2xl bg-slate-800 py-3 text-slate-200">Done</button>
          </div>
        )}

        {/* DONE / ERROR */}
        {(phase === "done" || phase === "error") && (
          <div className={"rounded-3xl border p-8 text-center shadow-xl " + (phase === "done" ? "border-emerald-900 bg-emerald-950/40" : "border-rose-900 bg-rose-950/40")}>
            <div className="text-5xl">{phase === "done" ? "✅" : "⚠️"}</div>
            <p className={"mt-3 text-lg font-semibold " + (phase === "done" ? "text-emerald-200" : "text-rose-200")}>{message}</p>
            <button onClick={reset} className="mt-6 w-full rounded-2xl bg-slate-800 py-3 text-slate-200">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
