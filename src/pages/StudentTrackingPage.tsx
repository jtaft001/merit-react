import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import { db } from "../firebase";

type Student = {
  id: string;
  name: string;
  email: string;
  className: string;
  status: string;
  lastActivity: unknown;
};

type Attempt = {
  id: string;
  studentId: string;
  studentName: string;
  scenarioId: string;
  scenarioTitle: string;
  status: string;
  score: number | null;
  notes: string | null;
  attemptedAt: unknown;
};

function normalizeStudent(doc: { id: string; data: () => Record<string, unknown> }): Student {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: typeof data.name === "string" ? data.name : "No name",
    email: typeof data.email === "string" ? data.email : "",
    className: typeof data.className === "string" ? data.className : "N/A",
    status: typeof data.status === "string" ? data.status : "Active",
    lastActivity: data.lastActivity ?? null,
  };
}

function normalizeAttempt(doc: { id: string; data: () => Record<string, unknown> }): Attempt {
  const data = doc.data() || {};
  return {
    id: doc.id,
    studentId: typeof data.studentId === "string" ? data.studentId : "",
    studentName: typeof data.studentName === "string" ? data.studentName : "",
    scenarioId: typeof data.scenarioId === "string" ? data.scenarioId : "",
    scenarioTitle: typeof data.scenarioTitle === "string" ? data.scenarioTitle : "",
    status: typeof data.status === "string" ? data.status : "Complete",
    score: typeof data.score === "number" ? data.score : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    attemptedAt: data.attemptedAt ?? null,
  };
}

async function fetchStudents(): Promise<Student[]> {
  const colRef = collection(db, "students");
  const q = query(colRef, orderBy("name"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeStudent);
}

async function fetchStudentAttempts(studentId: string): Promise<Attempt[]> {
  const colRef = collection(db, "attempts");
  const q = query(
    colRef,
    where("studentId", "==", studentId),
    orderBy("attemptedAt", "desc"),
    limit(50)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeAttempt);
}

function StudentTrackingPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [loadingAttempts, setLoadingAttempts] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function loadStudents() {
      try {
        setLoadingStudents(true);
        setError("");
        const result = await fetchStudents();
        setStudents(result);
        setFilteredStudents(result);
      } catch (err) {
        console.error(err);
        setError("Could not load students.");
      } finally {
        setLoadingStudents(false);
      }
    }

    loadStudents();
  }, []);

  useEffect(() => {
    let list = [...students];

    if (search.trim() !== "") {
      const lower = search.toLowerCase();
      list = list.filter(
        s =>
          (s.name || "").toLowerCase().includes(lower) ||
          (s.email || "").toLowerCase().includes(lower) ||
          (s.className || "").toLowerCase().includes(lower)
      );
    }

    if (statusFilter !== "All") {
      list = list.filter(s => (s.status || "Active") === statusFilter);
    }

    setFilteredStudents(list);
  }, [search, statusFilter, students]);

  async function handleSelectStudent(student: Student) {
    setSelectedStudent(student);
    setAttempts([]);
    setLoadingAttempts(true);
    setError("");

    try {
      const result = await fetchStudentAttempts(student.id);
      setAttempts(result);
    } catch (err) {
      console.error(err);
      setError("Could not load attempts for this student.");
    } finally {
      setLoadingAttempts(false);
    }
  }

  function formatDate(ts: unknown): string {
    if (!ts) return "";
    try {
      if (
        typeof ts === "object" &&
        ts !== null &&
        "toDate" in ts &&
        typeof (ts as { toDate?: () => Date }).toDate === "function"
      ) {
        return (ts as { toDate: () => Date }).toDate().toLocaleString();
      }
      if (ts instanceof Date) {
        return ts.toLocaleString();
      }
      if (typeof ts === "string" || typeof ts === "number") {
        const parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) {
          return parsed.toLocaleString();
        }
      }
      return "";
    } catch {
      return "";
    }
  }

  return (
    <div className="flex gap-4 p-4 h-screen">

      {/* LEFT SIDE LIST */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow p-4">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          Student Tracking
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          View student progress and scenario attempts.
        </p>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or class"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {loadingStudents && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Loading students...
          </div>
        )}

        {!loadingStudents && error && (
          <div className="mb-3 text-sm text-red-600">{error}</div>
        )}

        {!loadingStudents && filteredStudents.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            No students yet. Add some in Firestore.
          </div>
        )}

        {!loadingStudents && filteredStudents.length > 0 && (
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Class</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => (
                  <tr
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={
                      "cursor-pointer hover:bg-sky-50 " +
                      (selectedStudent && selectedStudent.id === student.id
                        ? "bg-sky-100"
                        : "")
                    }
                  >
                    <td className="px-3 py-2 font-medium">
                      {student.name || "No name"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {student.email || "N/A"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {student.className || "N/A"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "inline-flex text-xs px-2 py-1 rounded-full " +
                          ((student.status || "Active") === "Active"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-200 text-slate-700")
                        }
                      >
                        {student.status || "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {formatDate(student.lastActivity) || "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RIGHT SIDE DETAIL PANEL */}
      <div className="w-1/3 bg-white rounded-2xl shadow p-4 flex flex-col">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          Student details
        </h2>

        {!selectedStudent && (
          <p className="text-sm text-slate-500">
            Select a student on the left to view their scenario attempts.
          </p>
        )}

        {selectedStudent && (
          <>
            <div className="mb-3">
              <div className="text-base font-semibold text-slate-800">
                {selectedStudent.name}
              </div>
              <div className="text-sm text-slate-600">
                {selectedStudent.email}
              </div>
              <div className="text-sm text-slate-600">
                Class: {selectedStudent.className || "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Last activity: {formatDate(selectedStudent.lastActivity) || "N/A"}
              </div>
            </div>

            <div className="border-t border-slate-200 mt-2 pt-2">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-semibold text-slate-800">
                  Scenario attempts
                </span>
              </div>

              {loadingAttempts && (
                <div className="text-sm text-slate-500">Loading attempts...</div>
              )}

              {!loadingAttempts && attempts.length === 0 && (
                <div className="text-sm text-slate-500">
                  No attempts recorded yet.
                </div>
              )}

              {!loadingAttempts && attempts.length > 0 && (
                <div className="max-h-80 overflow-auto space-y-2">
                  {attempts.map(a => {
                    const status = a.status || "Complete";
                    const statusClass =
                      status === "Complete"
                        ? "bg-green-100 text-green-700"
                        : status === "In Progress"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-700";
                    const scoreDisplay =
                      a.score !== null && a.score !== undefined
                        ? a.score
                        : "N/A";

                    return (
                      <div
                        key={a.id}
                        className="border border-slate-200 rounded-xl p-2 text-xs"
                      >
                        <div className="flex justify-between mb-1">
                          <span className="font-semibold text-slate-800">
                            {a.scenarioTitle || "Scenario"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full ${statusClass}`}
                          >
                            {status}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            Score: {scoreDisplay}
                          </span>
                          <span className="text-slate-500">
                            {formatDate(a.attemptedAt) || "N/A"}
                          </span>
                        </div>

                        {a.notes ? (
                          <div className="mt-1 text-slate-600">
                            Notes: {a.notes}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StudentTrackingPage;
