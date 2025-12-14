import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPayrollReports, fetchPayrollForPeriod, type PayrollRecord } from "../services/payrollService";
import { fetchPayPeriods, type PayPeriod } from "../services/payPeriodService";

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

export default function PayrollPage() {
  const [reports, setReports] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");

  useEffect(() => {
    void loadPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      void load(selectedPeriod);
    }
  }, [selectedPeriod]);

  async function loadPeriods() {
    try {
      const data = await fetchPayPeriods();
      setPeriods(data);
      if (!selectedPeriod && data.length > 0) {
        setSelectedPeriod(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load pay periods.");
    }
  }

  async function load(periodId?: string) {
    try {
      setLoading(true);
      setError("");
      const data = periodId ? await fetchPayrollForPeriod(periodId, 200) : await fetchPayrollReports(100);
      setReports(data);
    } catch (err) {
      console.error(err);
      setError("Could not load payroll reports.");
    } finally {
      setLoading(false);
    }
  }

  const periodLabel = useMemo(() => {
    const found = periods.find((p) => p.id === selectedPeriod);
    if (!found) return "All periods";
    return found.display || `${found.startDate ? formatDate(found.startDate) : ""} – ${found.endDate ? formatDate(found.endDate) : ""}`;
  }, [periods, selectedPeriod]);

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Payroll</h1>
            <p className="text-sm text-slate-600">View payroll by pay period.</p>
          </div>
          <button
            onClick={() => load(selectedPeriod)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-600">Pay period</label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {!periods.length && <option value="">Loading periods...</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display ||
                  `${formatDate(p.startDate || undefined)} – ${formatDate(p.endDate || undefined)}`}
              </option>
            ))}
          </select>
        </div>
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">Payroll for {periodLabel}</h2>
          <span className="text-xs text-slate-500">
            {loading ? "Loading..." : `${reports.length} items`}
          </span>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0" style={{ background: "#143821" }}>
              <tr>
                <th className="px-3 py-2 text-left text-white">Student</th>
                <th className="px-3 py-2 text-left text-white">Period</th>
                <th className="px-3 py-2 text-right text-white">Net Hours</th>
                <th className="px-3 py-2 text-right text-white">Paid Hours</th>
                <th className="px-3 py-2 text-right text-white">Gross Pay</th>
                <th className="px-3 py-2 text-right text-white">Deductions</th>
                <th className="px-3 py-2 text-right text-white">Net Pay</th>
                <th className="px-3 py-2 text-left text-white">Created</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-800">
                    {r.studentId ? (
                      <Link
                        to={`/payroll/${r.id}`}
                        className="text-emerald-700 hover:text-emerald-900 hover:underline"
                      >
                        {r.studentId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.periodId || formatDate(r.periodEnd)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatHours(r.netHours)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatHours(r.paidHours)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">
                    {formatMoney(r.totalPay ?? r.netPay)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatMoney(r.deductions)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">
                    {formatMoney(r.netPay ?? ((r.totalPay || 0) - (r.deductions || 0)))}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
              {reports.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>
                    No payroll reports found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
