import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStudents, type StudentRecord } from "../services/studentService";
import {
  rewardCatalog,
  fetchRewardPurchasesForStudent,
  createRewardPurchase,
  fetchRewardSpendAndBalance,
  type RewardPurchase,
} from "../services/rewardService";

// Static roster fallback (matches Timeclock dashboard)
const EXPECTED_STUDENT_IDS: string[] = [
  "Molly Anaya",
  "Elly Blair",
  "Jaiden Burrows",
  "Anakin Cook",
  "Violet Corona Barriga",
  "Bryce Davis",
  "Jacob Dixon",
  "Kimberly Eckman",
  "Josh Einhaus",
  "Olivia Frost",
  "Kyler Fry",
  "Kylie Gambill",
  "Brooke Gordon",
  "Elizabeth Hall",
  "Tru Herr",
  "Maia Herrera",
  "Jack Kegg",
  "Lily Kennefic",
  "Eva Knee",
  "Jayme Leeper",
  "Adelynn Massey",
  "Jasmine Mata",
  "Alexa Miland",
  "Des Miller",
  "Rylie Nelson",
  "Maya Ontiveros",
  "Izabella Petersen",
  "Alyssa Powell",
  "Justice Powell",
  "Bella Rice",
  "Maisie Roberts",
  "Tatiana Wilkes",
];

function formatMoney(n?: number) {
  if (n == null || isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString();
}

export default function RewardsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [purchases, setPurchases] = useState<RewardPurchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balanceInfo, setBalanceInfo] = useState({ totalGross: 0, totalRewardSpend: 0, balance: 0 });
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const semesterStart = useMemo(() => {
    const now = new Date();
    const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // Aug 1 start
    return new Date(`${year}-08-01T00:00:00`);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchStudents();
        setStudents(list);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const loadStudent = useCallback(async (studentId: string) => {
    try {
      setLoading(true);
      setError("");
      const [purch, balance] = await Promise.all([
        fetchRewardPurchasesForStudent(studentId),
        fetchRewardSpendAndBalance(studentId, semesterStart),
      ]);
      setPurchases(purch);
      setBalanceInfo(balance);
    } catch (err) {
      console.error(err);
      setError("Could not load rewards data.");
    } finally {
      setLoading(false);
    }
  }, [semesterStart]);

  useEffect(() => {
    if (!selectedStudent) {
      setPurchases([]);
      setBalanceInfo({ totalGross: 0, totalRewardSpend: 0, balance: 0 });
      return;
    }
    void loadStudent(selectedStudent);
  }, [selectedStudent, loadStudent]);

  async function handleCreateReward(itemId: string) {
    if (!selectedStudent) {
      setError("Select a student first.");
      return;
    }
    const item = rewardCatalog.find((r) => r.id === itemId);
    if (!item) {
      setError("Reward not found.");
      return;
    }
    try {
      setCreatingId(itemId);
      setError("");
      await createRewardPurchase({
        studentId: selectedStudent,
        rewardId: item.id,
        rewardName: item.name,
        cost: item.cost,
        status: "approved",
      });
      await loadStudent(selectedStudent);
    } catch (err) {
      console.error(err);
      setError("Could not create reward purchase.");
    } finally {
      setCreatingId(null);
    }
  }

  const studentOptions = useMemo(() => {
    const combined: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    // Firestore students
    students.forEach((s) => {
      const id = s.id;
      const name = s.name || s.email || s.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      combined.push({ id, name });
    });

    // Fallback roster (ensures dropdown is populated even if students collection is sparse)
    EXPECTED_STUDENT_IDS.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      combined.push({ id, name: id });
    });

    return combined.sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rewards</h1>
          <p className="text-sm text-slate-600">
            Select a student, view balance, and log approved rewards (deducted in payroll).
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Student</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select student</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <SummaryCard label="Gross Earned (semester to date)" value={formatMoney(balanceInfo.totalGross)} />
          <SummaryCard label="Reward Spend (semester to date)" value={formatMoney(balanceInfo.totalRewardSpend)} />
          <SummaryCard label="Balance (bank)" value={formatMoney(balanceInfo.balance)} highlight />
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        {loading && <div className="text-sm text-slate-500">Loading...</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Reward Catalog</h2>
            <span className="text-xs text-slate-500">Click to add for selected student</span>
          </div>
          <div className="max-h-[520px] overflow-auto p-3 space-y-2">
            {rewardCatalog.map((item) => (
              <button
                key={item.id}
                onClick={() => void handleCreateReward(item.id)}
                disabled={!selectedStudent || creatingId === item.id}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.tier} · {item.category}
                    </div>
                    {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
                  </div>
                  <div className="text-sm font-semibold text-emerald-700">{formatMoney(item.cost)}</div>
                </div>
                {creatingId === item.id && (
                  <div className="text-xs text-slate-500 mt-1">Creating...</div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Purchases (approved)</h2>
            <span className="text-xs text-slate-500">
              {loading ? "Loading..." : `${purchases.length} items`}
            </span>
          </div>
          <div className="max-h-[520px] overflow-auto divide-y divide-slate-100 text-sm">
            {purchases.length === 0 && !loading && (
              <div className="px-4 py-3 text-slate-500">
                No purchases found for this student.
              </div>
            )}
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-800">{p.rewardName || p.rewardId}</div>
                  <div className="text-xs text-slate-500">{formatDate(p.createdAt)}</div>
                </div>
                <div className="text-rose-700 font-semibold">{formatMoney(p.cost)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-slate-200 p-3 shadow-sm"
      style={{ background: highlight ? "#d6f3df" : "white" }}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
