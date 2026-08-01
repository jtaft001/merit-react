import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createScenario,
  deleteScenario,
  fetchScenarios,
  sceneCount,
  setScenarioStatus,
  CATEGORY_TYPE_LABEL,
  type ScenarioRecord,
} from "../services/scenarioService";
import type { ScenarioCategory } from "../types/firestore";

const CATEGORIES: ScenarioCategory[] = ["shock", "trauma"];

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString();
}

export default function ScenariosAdminPage() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ScenarioCategory>("shock");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setScenarios(await fetchScenarios());
    } catch (err) {
      console.error(err);
      setError("Could not load scenarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const published = scenarios.filter((s) => s.status === "published").length;
    return { total: scenarios.length, published, drafts: scenarios.length - published };
  }, [scenarios]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createScenario({ title, description, category });
      // Jump straight into the editor for the new scenario.
      navigate(`/settings/scenarios/${id}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not create scenario.");
      setSaving(false);
    }
  }

  async function handlePublishToggle(s: ScenarioRecord) {
    const next = s.status === "published" ? "draft" : "published";
    if (next === "published" && sceneCount(s) === 0) {
      setError(`"${s.title}" has no scenes yet — add at least one before publishing.`);
      return;
    }
    try {
      await setScenarioStatus(s.id, next);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not update publish status.");
    }
  }

  async function handleDelete(s: ScenarioRecord) {
    if (
      !window.confirm(
        `Delete "${s.title}"? This permanently removes the scenario and all of its scenes. This cannot be undone.`
      )
    )
      return;
    try {
      await deleteScenario(s.id);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not delete scenario.");
    }
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Scenarios</h1>
            <p className="text-sm text-slate-500">
              Author interactive training scenarios and publish them to the
              Scenario Library.
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

      <main className="mx-auto max-w-5xl space-y-5 px-6 pb-12 pt-6">
        {/* CREATE SCENARIO */}
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-800">New scenario</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600">
                Title <span className="text-rose-500">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hypovolemic Shock — Motorcycle Crash"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary shown on the scenario card."
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ScenarioCategory)}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_TYPE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create & edit"}
          </button>
        </form>

        {/* SCENARIO LIST */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              All scenarios
            </h2>
            <span className="text-xs text-slate-500">
              {counts.total} total · {counts.published} published · {counts.drafts} draft
            </span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Scenes</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Updated</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      <Link
                        to={`/settings/scenarios/${s.id}`}
                        className="text-sky-700 hover:underline"
                      >
                        {s.title}
                      </Link>
                      {s.description && (
                        <p className="text-xs font-normal text-slate-500 line-clamp-1">
                          {s.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {CATEGORY_TYPE_LABEL[s.category]}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{sceneCount(s)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                          (s.status === "published"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600")
                        }
                      >
                        {s.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {formatDate(s.updatedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handlePublishToggle(s)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {s.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                        <Link
                          to={`/settings/scenarios/${s.id}`}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(s)}
                          className="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {scenarios.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No scenarios yet. Create one above.
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
        </div>
      </main>
    </div>
  );
}
