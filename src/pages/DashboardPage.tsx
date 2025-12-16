import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { scenarioTypes as BUILT_IN_SCENARIOS } from "../scenarios/shockScenarios";

type Scenario = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  scenarioKey?: string;
};

type ScenarioDoc = {
  title?: string;
  description?: string;
  type?: string;
  scenarioKey?: string;
};

type Props = {
  user: User;
};

export default function DashboardPage({ user }: Props) {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, "scenarios"));
        const list: Scenario[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as ScenarioDoc;
          list.push({
            id: doc.id,
            title: data.title ?? "(untitled scenario)",
            description: data.description ?? "",
            type: data.type ?? "",
            scenarioKey: data.scenarioKey ?? undefined,
          });
        });
        setScenarios(list);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error loading scenarios";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              MERIT EMS Dashboard
            </h1>
            <p className="text-xs text-slate-400">
              Interactive EMR and EMT training scenarios
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-xs font-medium text-slate-100">
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-sm transition hover:border-rose-500 hover:bg-rose-600 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        
        {/* Title Banner */}
        <section className="mb-6 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600/25 via-slate-900 to-slate-950 p-4 shadow-lg shadow-emerald-900/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-emerald-100">
                Scenario Library
              </h2>
              <p className="text-xs text-emerald-200/80">
                Select a scenario to launch the interactive trainer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[0.7rem] text-emerald-200/80">
              <button
                onClick={() => navigate(`/scenario?category=shock`)}
                className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 hover:bg-emerald-500/20"
              >
                Shock Scenarios
              </button>
              <button
                onClick={() => navigate(`/scenario?category=trauma`)}
                className="rounded-full border border-amber-500/60 bg-amber-500/10 px-3 py-1 hover:bg-amber-500/20 text-amber-100"
              >
                Trauma / Bleeding Scenarios
              </button>
              <button
                onClick={() => navigate(`/contact`)}
                className="rounded-full border border-slate-500/60 bg-slate-500/10 px-3 py-1 hover:bg-slate-500/20 text-slate-100"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </section>

        {/* Status Row */}
        <section className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span>
              Scenarios loaded:{" "}
              <span className="font-semibold text-emerald-300">
                {loading ? "loading..." : scenarios.length}
              </span>
            </span>
          </div>

          <div className="text-[0.7rem]">
            Click any scenario card to open it instantly.
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/60 bg-rose-950/60 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-center text-sm text-slate-300">
            Loading scenarios...
          </div>
        )}

        {/* No scenarios */}
        {!loading && !error && scenarios.length === 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-center text-sm text-slate-300">
            No scenarios found. Add entries to Firestore to populate the list.
          </div>
        )}

        {/* SCENARIO GRID */}
        {!loading && !error && scenarios.length > 0 && (
          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            {scenarios.map((sc) => (
              (() => {
                const path = sc.scenarioKey
                  ? `/scenario/${encodeURIComponent(sc.scenarioKey)}`
                  : "/scenario";
                const hasKey = Boolean(sc.scenarioKey);
                return (
                  <Link
                    key={sc.id}
                    to={path}
                    className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-3 shadow-sm shadow-slate-950/40 transition hover:border-emerald-400/70 hover:bg-slate-900 hover:shadow-emerald-900/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-emerald-300/90">
                          {sc.type || "Shock Scenario"}
                        </p>
                        <h3 className="mt-1 text-sm font-semibold text-slate-50">
                          {sc.title}
                        </h3>
                        {sc.description && (
                          <p className="mt-1 line-clamp-2 text-[0.75rem] text-slate-400">
                            {sc.description}
                          </p>
                        )}
                      </div>

                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] font-semibold text-emerald-300 group-hover:bg-emerald-500/20">
                        Open
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[0.7rem] text-slate-500">
                      <span className="truncate">
                        Key:{" "}
                        <span className="font-mono">
                          {hasKey ? sc.scenarioKey : "not linked"}
                        </span>
                      </span>
                      <span
                        className={
                          "text-emerald-300/80 group-hover:text-emerald-200 " +
                          (hasKey ? "" : "italic text-amber-300/80")
                        }
                      >
                        {hasKey ? "Launch scenario →" : "Opens shock menu"}
                      </span>
                    </div>
                  </Link>
                );
              })()
            ))}
          </section>
        )}

        {/* Built-in scenarios */}
        <section className="mt-8">
          <h3 className="text-sm font-semibold text-emerald-200 mb-2">
            Built-in scenarios (local)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUILT_IN_SCENARIOS.map((sc) => {
              const path = `/scenario/${encodeURIComponent(sc.id)}?category=${sc.category}`;
              return (
                <Link
                  key={sc.id}
                  to={path}
                  className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-3 shadow-sm shadow-slate-950/40 transition hover:border-emerald-400/70 hover:bg-slate-900 hover:shadow-emerald-900/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-emerald-300/90">
                        {sc.category === "shock" ? "Shock" : "Trauma / Bleeding"}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-50">
                        {sc.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[0.75rem] text-slate-400">
                        {sc.description}
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] font-semibold text-emerald-300 group-hover:bg-emerald-500/20">
                      Open
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[0.7rem] text-slate-500">
                    <span className="truncate">
                      Key: <span className="font-mono">{sc.id}</span>
                    </span>
                    <span className="text-emerald-300/80 group-hover:text-emerald-200">
                      Launch scenario →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
