import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function AddUserPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleAddUser() {
    if (!email || !password || !firstName || !lastName) {
      setStatus("All fields are required.");
      return;
    }

    setStatus("Creating user...");

    try {
      const functions = getFunctions();
      const createUser = httpsCallable(functions, 'createUser');
      await createUser({ email, password, firstName, lastName });

      setStatus(`User ${email} created successfully.`);
      
      // Clear form
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus("Error creating user: " + message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Add New User
            </h1>
            <p className="text-xs text-slate-400">
              Create a new user account with a linked student profile.
            </p>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <div className="max-w-md">
          <div className="space-y-4">
             <div>
              <label className="block text-sm font-medium text-slate-300">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block w-full rounded-md border-slate-700 bg-slate-800 px-3 py-2 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-300">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block w-full rounded-md border-slate-700 bg-slate-800 px-3 py-2 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-slate-700 bg-slate-800 px-3 py-2 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-slate-700 bg-slate-800 px-3 py-2 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
              />
            </div>
            <button
              onClick={handleAddUser}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Add User
            </button>
          </div>
          {status && <p className="mt-4 text-sm text-slate-400">{status}</p>}
        </div>
      </main>
    </div>
  );
}
