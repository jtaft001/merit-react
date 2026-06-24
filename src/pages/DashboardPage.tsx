import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { auth } from "../firebase";

import { getStudentForUser, type StudentRecord } from "../services/studentService";
import {
  fetchLatestInProgressForStudent,
  type AttemptRecord,
} from "../services/attemptsService";
import { fetchStudentAttempts } from "../services/studentService";
import { fetchSessionsForStudent, type SessionRecord } from "../services/sessionsService";
import { fetchPayrollForStudent, type PayrollRecord } from "../services/payrollService";
import { fetchRewardSpendAndBalance } from "../services/rewardService";

type Props = {
  user: User;
  isAdmin?: boolean;
};

// A completed/in-progress attempt as returned by fetchStudentAttempts (raw doc).
type RecentAttempt = {
  id: string;
  scenarioId?: string;
  scenarioTitle?: string;
  score?: number;
  passed?: boolean;
  status?: string;
  attemptedAt?: Date | null;
};

// ---- formatting helpers -------------------------------------------------

function toDate(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") return new Date(val);
  return null;
}

function formatMoney(n?: number) {
  if (n == null || isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function msToHours(ms?: number) {
  if (ms == null || isNaN(ms)) return 0;
  return ms / (1000 * 60 * 60);
}

function formatHours(hours?: number) {
  if (hours == null || isNaN(hours)) return "—";
  return `${hours.toFixed(2)} hrs`;
}

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString();
}

function formatDateTime(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---- small presentational pieces ---------------------------------------

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScoreBadge({ passed, score }: { passed?: boolean; score?: number }) {
  const label = score != null ? `${score}` : "—";
  const cls = passed
    ? "bg-emerald-100 text-emerald-800"
    : "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ---- main component -----------------------------------------------------

export default function DashboardPage({ user, isAdmin = false }: Props) {
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [inProgress, setInProgress] = useState<AttemptRecord | null>(null);
  const [recent, setRecent] = useState<RecentAttempt[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [latestPaystub, setLatestPaystub] = useState<PayrollRecord | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkWarning, setLinkWarning] = useState(false);

  async function handleLogout() {
    await signOut(auth);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLinkWarning(false);
    try {
      // Resolve the linked student record once. Scenario attempts are keyed by
      // the student-doc id; payroll/sessions/rewards are keyed by the auth uid
      // (matching PayrollPage / PaystubPage). We query each source by its own id
      // and degrade gracefully to an empty state if nothing comes back.
      const studentDoc = await getStudentForUser(user);
      setStudent(studentDoc);
      if (!studentDoc) setLinkWarning(true);

      const attemptsId = studentDoc?.id ?? "";
      const moneyId = user.uid;

      const [
        inProgressRes,
        recentRes,
        sessionsRes,
        payrollRes,
        balanceRes,
      ] = await Promise.allSettled([
        attemptsId
          ? fetchLatestInProgressForStudent(attemptsId)
          : Promise.resolve(null),
        attemptsId ? fetchStudentAttempts(attemptsId) : Promise.resolve([]),
        fetchSessionsForStudent(moneyId, 30, 200),
        fetchPayrollForStudent(moneyId, 1),
        fetchRewardSpendAndBalance(moneyId),
      ]);

      if (inProgressRes.status === "fulfilled") setInProgress(inProgressRes.value);

      if (recentRes.status === "fulfilled") {
        const rows = (recentRes.value as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          scenarioId: r.scenarioId as string | undefined,
          scenarioTitle: r.scenarioTitle as string | undefined,
          score: r.score as number | undefined,
          passed: r.passed as boolean | undefined,
          status: r.status as string | undefined,
          attemptedAt: toDate(r.attemptedAt),
        }));
        // Show the most recent COMPLETED attempts (newest first already).
        setRecent(rows.filter((r) => r.status !== "In Progress").slice(0, 3));
      }

      if (sessionsRes.status === "fulfilled") setSessions(sessionsRes.value);
      if (payrollRes.status === "fulfilled") {
        setLatestPaystub(payrollRes.value[0] ?? null);
      }
      if (balanceRes.status === "fulfilled") setBalance(balanceRes.value.balance);
    } catch (err) {
      console.error("Dashboard load failed", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived timeclock figures from the last 30 days of sessions.
  const openSession = sessions.find((s) => s.clockIn && !s.clockOut) ?? null;
  const lastSession = sessions[0] ?? null;
  const last30Hours = sessions.reduce((sum, s) => sum + msToHours(s.netMs), 0);

  const displayName =
    student?.name || user.displayName || user.email || "there";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Welcome back, {displayName}
            </h1>
            <p className="text-sm text-slate-500">
              Here&apos;s where you left off.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-xs font-medium text-slate-700">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-12 pt-6 space-y-5">
        {/* ADMIN SUMMARY STRIP */}
        {isAdmin && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Staff tools
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { to: "/students", label: "Students" },
                { to: "/payroll", label: "Payroll" },
                { to: "/timeclock-live", label: "Timeclock Live" },
                { to: "/settings", label: "Settings" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {linkWarning && !loading && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            We couldn&apos;t find a student record linked to this account, so your
            personalized data may be limited. Ask your instructor to link your
            account if this looks wrong.
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Loading your dashboard…
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* CONTINUE TRAINING */}
            <Card
              title="Continue training"
              action={
                <Link
                  to="/scenarios"
                  className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
                >
                  All scenarios →
                </Link>
              }
            >
              {inProgress ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
                    In progress
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {inProgress.scenarioTitle || "Untitled scenario"}
                  </p>
                  <Link
                    to={`/scenario/${inProgress.scenarioId ?? ""}`}
                    className="mt-3 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                  >
                    Resume scenario
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">
                    No scenario in progress.
                  </p>
                  <Link
                    to="/scenarios"
                    className="mt-3 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                  >
                    Start a scenario
                  </Link>
                </div>
              )}

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent attempts
                </p>
                {recent.length > 0 ? (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {recent.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {a.scenarioTitle || "Untitled scenario"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDateTime(a.attemptedAt)}
                          </p>
                        </div>
                        <ScoreBadge passed={a.passed} score={a.score} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No completed attempts yet.
                  </p>
                )}
              </div>
            </Card>

            {/* TIMECLOCK */}
            <Card
              title="Timeclock"
              action={
                <Link
                  to="/time-attendance"
                  className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
                >
                  Time &amp; Attendance →
                </Link>
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    openSession ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                <span className="text-sm font-medium text-slate-700">
                  {openSession
                    ? `Clocked in since ${formatDateTime(openSession.clockIn)}`
                    : "Not clocked in"}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Last session</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-800">
                    {lastSession ? formatDate(lastSession.clockIn) : "—"}
                  </dd>
                  <dd className="text-xs text-slate-500">
                    {lastSession ? formatHours(msToHours(lastSession.netMs)) : ""}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Last 30 days</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-800">
                    {formatHours(last30Hours)}
                  </dd>
                  <dd className="text-xs text-slate-500">
                    {sessions.length} session{sessions.length === 1 ? "" : "s"}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* PAYSTUB OVERVIEW */}
            <Card
              title="Paystub overview"
              action={
                <Link
                  to="/payroll"
                  className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
                >
                  My paystubs →
                </Link>
              }
            >
              {latestPaystub ? (
                <div>
                  <p className="text-xs text-slate-500">Most recent paystub</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-700">
                    Period ending {formatDate(latestPaystub.periodEnd)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Net pay</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {formatMoney(
                          latestPaystub.netPay ?? latestPaystub.totalPay
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Net hours</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {latestPaystub.netHours != null
                          ? latestPaystub.netHours.toFixed(2)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/payroll/${latestPaystub.id}`}
                    className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                  >
                    View full paystub →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No paystubs yet.</p>
              )}

              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Reward balance</p>
                <p className="text-xl font-semibold text-emerald-900">
                  {balance != null ? formatMoney(balance) : "—"}
                </p>
              </div>
            </Card>

            {/* QUICK LINKS */}
            <Card title="Quick links">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { to: "/scenarios", label: "Scenarios", sub: "Practice patient care" },
                  { to: "/time-attendance", label: "Time & Attendance", sub: "Clock in / out & sessions" },
                  { to: "/payroll", label: "Paystubs", sub: "Your pay history" },
                  { to: "/rewards", label: "Rewards", sub: "Spend your balance" },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-sky-50"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {l.label}
                    </p>
                    <p className="text-xs text-slate-500">{l.sub}</p>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
