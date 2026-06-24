import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  fetchStudents,
  setStudentStatus,
  type StudentRecord,
} from "../services/studentService";
import { fetchClasses, type ClassRecord } from "../services/classService";

function generatePassword(): string {
  // Readable, 12-char strong password (avoids ambiguous chars).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
  return out + "!";
}

export default function StudentsAdminPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // filters
  const [classFilter, setClassFilter] = useState("all"); // all | unassigned | <classId>
  const [search, setSearch] = useState("");
  const [showDropped, setShowDropped] = useState(false);

  // add-student form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [classId, setClassId] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, c] = await Promise.all([fetchStudents(), fetchClasses()]);
      setStudents(s);
      setClasses(c);
    } catch (err) {
      console.error(err);
      setError("Could not load students or classes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClasses = useMemo(
    () => classes.filter((c) => c.status === "active"),
    [classes]
  );

  const visible = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return students.filter((s) => {
      const dropped = (s.status || "").toLowerCase() === "dropped";
      if (showDropped !== dropped) return false;

      if (classFilter === "unassigned" && s.classId) return false;
      if (
        classFilter !== "all" &&
        classFilter !== "unassigned" &&
        s.classId !== classFilter
      )
        return false;

      if (!lower) return true;
      return (
        (s.name || "").toLowerCase().includes(lower) ||
        (s.email || "").toLowerCase().includes(lower) ||
        (s.className || "").toLowerCase().includes(lower) ||
        (s.studentNumber || "").toLowerCase().includes(lower)
      );
    });
  }, [students, search, classFilter, showDropped]);

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg("");
    if (!firstName || !lastName || !email || !password) {
      setFormMsg("First name, last name, email, and password are required.");
      return;
    }
    if (password.length < 6) {
      setFormMsg("Password must be at least 6 characters.");
      return;
    }
    setCreating(true);
    try {
      const selectedClass = activeClasses.find((c) => c.id === classId);
      const createUser = httpsCallable(functions, "createUser");
      await createUser({
        email,
        password,
        firstName,
        lastName,
        grade: grade || undefined,
        studentNumber: studentNumber || undefined,
        classId: classId || undefined,
        className: selectedClass?.name || undefined,
      });
      setFormMsg(`Created ${firstName} ${lastName}. Password: ${password}`);
      setFirstName("");
      setLastName("");
      setEmail("");
      setGrade("");
      setStudentNumber("");
      setClassId("");
      setPassword("");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not create student.";
      setFormMsg(`Error: ${msg}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDropToggle(s: StudentRecord) {
    const dropped = (s.status || "").toLowerCase() === "dropped";
    const action = dropped ? "restore" : "drop";
    if (
      !window.confirm(
        `Are you sure you want to ${action} ${s.name || "this student"}? ` +
          (dropped
            ? "They will return to the active roster."
            : "Their history is kept; they can be restored later.")
      )
    ) {
      return;
    }
    try {
      await setStudentStatus(s.id, dropped ? "Active" : "Dropped");
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not update student status.");
    }
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Students</h1>
            <p className="text-sm text-slate-500">
              Add new students, assign classes, and drop students at year-end.
            </p>
          </div>
          <Link
            to="/settings"
            className="text-sm font-medium text-sky-600 hover:text-sky-800 hover:underline"
          >
            ← Settings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 pb-12 pt-6">
        {/* ADD STUDENT */}
        <form
          onSubmit={handleAddStudent}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-800">Add student</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Creates a login account plus a student record.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-600">
                First name <span className="text-rose-500">*</span>
              </label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Last name <span className="text-rose-500">*</span>
              </label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Email <span className="text-rose-500">*</span>
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Grade</label>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 11" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Student ID number
              </label>
              <input
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                placeholder="School ID #"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>
                <option value="">— Unassigned —</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-600">
                Password <span className="text-rose-500">*</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Generate
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                The password is shown once after creating — copy it for the student.
              </p>
            </div>
          </div>
          {formMsg && (
            <p
              className={`mt-3 text-sm ${
                formMsg.startsWith("Error") ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {creating ? "Creating…" : "Add student"}
          </button>
        </form>

        {/* ROSTER */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {showDropped ? "Dropped students" : "Active roster"}{" "}
              <span className="text-slate-400">({visible.length})</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, ID…"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
              >
                <option value="all">All classes</option>
                <option value="unassigned">Unassigned</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowDropped((v) => !v)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showDropped ? "Show active" : "Show dropped"}
              </button>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Grade</th>
                  <th className="px-4 py-2">Student ID</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{s.name || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{s.email || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{s.grade || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{s.studentNumber || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{s.className || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDropToggle(s)}
                        className={
                          "rounded-md border px-3 py-1 text-xs font-medium " +
                          (showDropped
                            ? "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
                            : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50")
                        }
                      >
                        {showDropped ? "Restore" : "Drop"}
                      </button>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No students match.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {error && <p className="px-5 py-3 text-sm text-rose-600">{error}</p>}
        </div>
      </main>
    </div>
  );
}
