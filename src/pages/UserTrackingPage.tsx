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

type User = {
  id: string;
  name: string;
  email: string;
  className: string;
  status: string;
  lastActivity: unknown;
};

type Attempt = {
  id: string;
  userId: string;
  userName: string;
  scenarioId: string;
  scenarioTitle: string;
  status: string;
  score: number | null;
  notes: string | null;
  attemptedAt: unknown;
};

function normalizeUser(doc: { id: string; data: () => Record<string, unknown> }): User {
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
    userId: typeof data.userId === "string" ? data.userId : "",
    userName: typeof data.userName === "string" ? data.userName : "",
    scenarioId: typeof data.scenarioId === "string" ? data.scenarioId : "",
    scenarioTitle: typeof data.scenarioTitle === "string" ? data.scenarioTitle : "",
    status: typeof data.status === "string" ? data.status : "Complete",
    score: typeof data.score === "number" ? data.score : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    attemptedAt: data.attemptedAt ?? null,
  };
}

async function fetchUsers(): Promise<User[]> {
  const colRef = collection(db, "users");
  const q = query(colRef, orderBy("name"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeUser);
}

async function fetchUserAttempts(userId: string): Promise<Attempt[]> {
  const colRef = collection(db, "attempts");
  const q = query(
    colRef,
    where("userId", "==", userId),
    orderBy("attemptedAt", "desc"),
    limit(50)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeAttempt);
}

function UserTrackingPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [loadingAttempts, setLoadingAttempts] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        setError("");
        const result = await fetchUsers();
        setUsers(result);
        setFilteredUsers(result);
      } catch (err) {
        console.error(err);
        setError("Could not load users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, []);

  useEffect(() => {
    let list = [...users];

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

    setFilteredUsers(list);
  }, [search, statusFilter, users]);

  async function handleSelectUser(user: User) {
    setSelectedUser(user);
    setAttempts([]);
    setLoadingAttempts(true);
    setError("");

    try {
      const result = await fetchUserAttempts(user.id);
      setAttempts(result);
    } catch (err) {
      console.error(err);
      setError("Could not load attempts for this user.");
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
          User Tracking
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          View user progress and scenario attempts.
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

        {loadingUsers && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Loading users...
          </div>
        )}

        {!loadingUsers && error && (
          <div className="mb-3 text-sm text-red-600">{error}</div>
        )}

        {!loadingUsers && filteredUsers.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            No users yet. Add some in Firestore.
          </div>
        )}

        {!loadingUsers && filteredUsers.length > 0 && (
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
                {filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={
                      "cursor-pointer hover:bg-sky-50 " +
                      (selectedUser && selectedUser.id === user.id
                        ? "bg-sky-100"
                        : "")
                    }
                  >
                    <td className="px-3 py-2 font-medium">
                      {user.name || "No name"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {user.email || "N/A"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {user.className || "N/A"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "inline-flex text-xs px-2 py-1 rounded-full " +
                          ((user.status || "Active") === "Active"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-200 text-slate-700")
                        }
                      >
                        {user.status || "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {formatDate(user.lastActivity) || "N/A"}
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
          User details
        </h2>

        {!selectedUser && (
          <p className="text-sm text-slate-500">
            Select a user on the left to view their scenario attempts.
          </p>
        )}

        {selectedUser && (
          <>
            <div className="mb-3">
              <div className="text-base font-semibold text-slate-800">
                {selectedUser.name}
              </div>
              <div className="text-sm text-slate-600">
                {selectedUser.email}
              </div>
              <div className="text-sm text-slate-600">
                Class: {selectedUser.className || "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Last activity: {formatDate(selectedUser.lastActivity) || "N/A"}
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

export default UserTrackingPage;
