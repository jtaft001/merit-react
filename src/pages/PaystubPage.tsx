import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchPayrollById,
  fetchSessionsForStudentPeriod,
  fetchWarningsForStudentPeriod,
  type PayrollRecord,
  type Session,
  type Warning,
} from "../services/payrollService";
import { fetchPayPeriodById, type PayPeriod } from "../services/payPeriodService";
import {
  fetchRewardPurchasesForStudent,
  type RewardPurchase,
  fetchRewardSpendAndBalance,
} from "../services/rewardService";

function formatMoney(n?: number) {
  if (n == null || isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatHours(n?: number) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(2);
}

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString();
}

function formatTime(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatHoursFromMs(ms?: number | null) {
  if (ms == null || isNaN(ms)) return "—";
  const hours = ms / 1000 / 60 / 60;
  return `${hours.toFixed(2)}h`;
}

export default function PaystubPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<PayrollRecord | null>(null);
  const [period, setPeriod] = useState<PayPeriod | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [rewardPurchases, setRewardPurchases] = useState<RewardPurchase[]>([]);
  const [semesterTotals, setSemesterTotals] = useState<{ gross: number; rewards: number; balance: number }>({
    gross: 0,
    rewards: 0,
    balance: 0,
  });

  const semesterStart = useMemo(() => {
    const now = new Date();
    const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // Aug 1 start
    return new Date(`${year}-08-01T00:00:00`);
  }, []);

  useEffect(() => {
    if (!id) return;
    void load(id);
  }, [id]);

  async function load(payrollId: string) {
    try {
      setLoading(true);
      setError("");
      const rec = await fetchPayrollById(payrollId);
      setRecord(rec);
      if (rec?.periodId) {
        const p = await fetchPayPeriodById(rec.periodId);
        setPeriod(p);
      } else {
        setPeriod(null);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load paystub.");
    } finally {
      setLoading(false);
    }
  }

  const loadDetails = useCallback(
    async (
    studentId: string,
    startStr: string,
    endStr: string,
    startDate: Date,
    endDate: Date
    ) => {
    try {
      setDetailLoading(true);
      const [sess, warns, rewards, semester] = await Promise.all([
        fetchSessionsForStudentPeriod(studentId, startStr, endStr),
        fetchWarningsForStudentPeriod(studentId, startStr, endStr),
        fetchRewardPurchasesForStudent(studentId, startDate, endDate),
        fetchRewardSpendAndBalance(studentId, semesterStart),
      ]);
      setSessions(sess);
      setWarnings(warns);
      setRewardPurchases(rewards);
      setSemesterTotals({
        gross: semester.totalGross,
        rewards: semester.totalRewardSpend,
        balance: semester.balance,
      });
    } catch (err) {
      console.error(err);
      setError("Could not load session/warning details.");
    } finally {
      setDetailLoading(false);
    }
  },
    [semesterStart]
  );

  useEffect(() => {
    const startDate = period?.startDate;
    const endDate = period?.endDate ?? record?.periodEnd ?? null;
    if (!record?.studentId || !startDate || !endDate) {
      setSessions([]);
      setWarnings([]);
      setRewardPurchases([]);
      setSemesterTotals({ gross: 0, rewards: 0, balance: 0 });
      return;
    }
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    void loadDetails(record.studentId, startStr, endStr, startDate, endDate);
  }, [record?.studentId, period?.startDate, period?.endDate, record?.periodEnd, loadDetails]);

  const gross = record?.totalPay ?? record?.netPay ?? 0;
  const deductions = record?.deductions ?? 0;
  const rewardDeduction = record?.rewardDeduction ?? 0;
  const warningDeduction = record?.warningDeduction ?? 0;
  const net = record?.netPay ?? gross - deductions;
  const hasRange = Boolean(period?.startDate && (period?.endDate || record?.periodEnd));
  const rewardTotal = rewardPurchases.reduce((sum, r) => sum + (r.cost || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pay Stub</h1>
          <p className="text-sm text-slate-600">Individual breakdown of pay, hours, and deductions.</p>
        </div>
        <Link
          to="/payroll"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Payroll
        </Link>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {loading && <div className="text-sm text-slate-600">Loading...</div>}
      {!loading && !record && !error && (
        <div className="text-sm text-slate-600">Paystub not found.</div>
      )}

      {record && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Student</div>
              <div className="text-base font-semibold text-slate-900">{record.studentId || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Pay Period</div>
              <div className="text-base text-slate-900">
                {record.periodId || formatDate(record.periodEnd)}
              </div>
              {period && (
                <div className="text-sm text-slate-600">
                  {period.display ||
                    `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Created</div>
              <div className="text-base text-slate-900">{formatDate(record.createdAt)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
              <div className="text-sm font-semibold text-slate-800 mb-2">Hours</div>
              <dl className="space-y-1 text-sm text-slate-700">
                <div className="flex justify-between">
                  <dt>Net Hours</dt>
                  <dd>{formatHours(record.netHours)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Paid Hours</dt>
                  <dd>{formatHours(record.paidHours)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
              <div className="text-sm font-semibold text-slate-800 mb-2">Pay</div>
              <dl className="space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <dt>Semester Gross</dt>
                  <dd className="font-semibold text-slate-900">{formatMoney(semesterTotals.gross)}</dd>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <dt>Semester Reward Spend</dt>
                  <dd className="text-rose-700">{formatMoney(semesterTotals.rewards)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Gross Pay</dt>
                  <dd className="font-semibold text-slate-900">{formatMoney(gross)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Deductions</dt>
                  <dd className="text-rose-700">{formatMoney(deductions)}</dd>
                </div>
                {warningDeduction ? (
                  <div className="flex justify-between text-slate-700">
                    <dt className="text-xs">Warnings</dt>
                    <dd className="text-xs text-rose-700">{formatMoney(warningDeduction)}</dd>
                  </div>
                ) : null}
                {rewardDeduction ? (
                  <div className="flex justify-between text-slate-700">
                    <dt className="text-xs">Rewards</dt>
                    <dd className="text-xs text-rose-700">{formatMoney(rewardDeduction)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <dt>Net Pay</dt>
                  <dd className="font-semibold text-emerald-700">{formatMoney(net)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Reward Purchases</div>
                <div className="text-xs text-slate-500">Approved rewards within this pay period</div>
              </div>
              <span className="text-xs text-slate-500">
                {detailLoading ? "Loading..." : formatMoney(rewardTotal)}
              </span>
            </div>
            <div className="max-h-60 overflow-auto text-sm">
              {rewardPurchases.length === 0 && !detailLoading && (
                <div className="px-4 py-3 text-slate-500">No approved reward purchases in this period.</div>
              )}
              {rewardPurchases.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border-b border-slate-100 px-4 py-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium text-slate-800">
                      {r.rewardName || r.rewardId || "Reward"}
                    </div>
                    <div className="text-xs text-slate-500">{formatDate(r.createdAt)}</div>
                  </div>
                  <div className="text-sm text-rose-700 font-semibold">{formatMoney(r.cost)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Sessions</div>
                <div className="text-xs text-slate-500">
                  Clock-ins/outs for the pay period (net duration shown)
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {detailLoading ? "Loading..." : `${sessions.length} entries`}
              </span>
            </div>
            {hasRange ? (
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-600">Date</th>
                      <th className="px-3 py-2 text-left text-slate-600">Clock In</th>
                      <th className="px-3 py-2 text-left text-slate-600">Clock Out</th>
                      <th className="px-3 py-2 text-right text-slate-600">Net</th>
                      <th className="px-3 py-2 text-right text-slate-600">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b last:border-b-0 border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{s.dateStr || "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{formatTime(s.clockIn)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatTime(s.clockOut)}</td>
                        <td className="px-3 py-2 text-right text-slate-800">
                          {formatHoursFromMs(s.netMs)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {formatHoursFromMs(s.grossMs)}
                        </td>
                      </tr>
                    ))}
                    {!detailLoading && sessions.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-slate-500 text-sm" colSpan={5}>
                          No sessions found in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-slate-600">
                No pay period date range available to show sessions.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Warnings</div>
                <div className="text-xs text-slate-500">Penalty events included in deductions</div>
              </div>
              <span className="text-xs text-slate-500">
                {detailLoading ? "Loading..." : `${warnings.length} items`}
              </span>
            </div>
            {hasRange ? (
              <div className="max-h-60 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-600">Date</th>
                      <th className="px-3 py-2 text-left text-slate-600">Issue</th>
                      <th className="px-3 py-2 text-left text-slate-600">Start</th>
                      <th className="px-3 py-2 text-left text-slate-600">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warnings.map((w) => (
                      <tr key={w.id} className="border-b last:border-b-0 border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{w.dateStr || "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{w.issue || "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{formatTime(w.startTs)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatTime(w.endTs)}</td>
                      </tr>
                    ))}
                    {!detailLoading && warnings.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-slate-500 text-sm" colSpan={4}>
                          No warnings in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-slate-600">
                No pay period date range available to show warnings.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
