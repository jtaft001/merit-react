import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getScenario,
  updateScenario,
  CATEGORY_TYPE_LABEL,
  DEFAULT_START_SCENE,
  type ScenarioRecord,
} from "../services/scenarioService";
import type {
  ScenarioCategory,
  ScenarioScene,
  ScenarioSceneOption,
  ScenarioVitals,
} from "../types/firestore";

const CATEGORIES: ScenarioCategory[] = ["shock", "trauma"];

// Local editable copy of a scene keyed by its scene key.
type ScenesMap = Record<string, ScenarioScene>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function emptyScene(title = "New scene"): ScenarioScene {
  return { title, text: "", vitals: null, options: [] };
}

export default function ScenarioEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  // meta
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ScenarioCategory>("shock");
  const [startSceneKey, setStartSceneKey] = useState(DEFAULT_START_SCENE);

  // scenes
  const [scenes, setScenes] = useState<ScenesMap>({});
  const [record, setRecord] = useState<ScenarioRecord | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const rec = await getScenario(id);
      if (!rec) {
        setError("Scenario not found.");
        return;
      }
      setRecord(rec);
      setTitle(rec.title);
      setDescription(rec.description);
      setCategory(rec.category);
      setStartSceneKey(rec.startSceneKey);
      setScenes(rec.scenes);
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError("Could not load scenario.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sceneKeys = useMemo(() => Object.keys(scenes), [scenes]);

  function markDirty() {
    setDirty(true);
    setNotice("");
  }

  // ----- scene mutations (all clone before mutating so React re-renders) -----

  function updateScene(key: string, patch: Partial<ScenarioScene>) {
    setScenes((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    markDirty();
  }

  function addScene() {
    // Compute the free key (scene_2, scene_3, …) inside the updater so rapid
    // clicks can't collide on a key derived from stale state.
    setScenes((prev) => {
      let n = Object.keys(prev).length + 1;
      let key = `scene_${n}`;
      while (prev[key]) {
        n += 1;
        key = `scene_${n}`;
      }
      return { ...prev, [key]: emptyScene() };
    });
    markDirty();
  }

  function renameScene(oldKey: string, rawNewKey: string) {
    const newKey = slugify(rawNewKey);
    if (!newKey || newKey === oldKey) return;
    if (scenes[newKey]) {
      setError(`A scene with key "${newKey}" already exists.`);
      return;
    }
    setError("");
    setScenes((prev) => {
      // Rebuild the map preserving order, swapping the key.
      const next: ScenesMap = {};
      for (const k of Object.keys(prev)) {
        next[k === oldKey ? newKey : k] = prev[k];
      }
      // Repoint every option that targeted the old key.
      for (const k of Object.keys(next)) {
        next[k] = {
          ...next[k],
          options: next[k].options.map((o) =>
            o.next === oldKey ? { ...o, next: newKey } : o
          ),
        };
      }
      return next;
    });
    if (startSceneKey === oldKey) setStartSceneKey(newKey);
    markDirty();
  }

  function deleteScene(key: string) {
    if (key === startSceneKey) {
      setError("You can't delete the start scene. Pick a different start scene first.");
      return;
    }
    if (!window.confirm(`Delete scene "${key}"? Options pointing to it will be cleared.`))
      return;
    setError("");
    setScenes((prev) => {
      const next: ScenesMap = {};
      for (const k of Object.keys(prev)) {
        if (k === key) continue;
        next[k] = {
          ...prev[k],
          // Blank out dangling targets so they show as "unset".
          options: prev[k].options.map((o) =>
            o.next === key ? { ...o, next: "" } : o
          ),
        };
      }
      return next;
    });
    markDirty();
  }

  // ----- option mutations -----

  function addOption(sceneKey: string) {
    const opt: ScenarioSceneOption = { text: "", next: "", points: 0 };
    updateScene(sceneKey, { options: [...scenes[sceneKey].options, opt] });
  }

  function updateOption(
    sceneKey: string,
    index: number,
    patch: Partial<ScenarioSceneOption>
  ) {
    const options = scenes[sceneKey].options.map((o, i) =>
      i === index ? { ...o, ...patch } : o
    );
    updateScene(sceneKey, { options });
  }

  function deleteOption(sceneKey: string, index: number) {
    const options = scenes[sceneKey].options.filter((_, i) => i !== index);
    updateScene(sceneKey, { options });
  }

  // ----- vitals -----

  function toggleVitals(sceneKey: string, enabled: boolean) {
    updateScene(sceneKey, { vitals: enabled ? {} : null });
  }

  function updateVital(
    sceneKey: string,
    field: "hr" | "rr" | "spo2" | "temp" | "gcs" | "skin" | "systolic" | "diastolic",
    raw: string
  ) {
    const current: ScenarioVitals = scenes[sceneKey].vitals ?? {};
    const next: ScenarioVitals = { ...current };
    if (field === "skin") {
      if (raw) next.skin = raw;
      else delete next.skin;
    } else if (field === "systolic" || field === "diastolic") {
      const bp = { systolic: 0, diastolic: 0, ...(current.bp ?? {}) };
      const n = raw === "" ? NaN : Number(raw);
      bp[field] = Number.isNaN(n) ? 0 : n;
      if (raw === "" && !current.bp) delete next.bp;
      else next.bp = bp;
    } else {
      const n = raw === "" ? NaN : Number(raw);
      if (raw === "" || Number.isNaN(n)) delete next[field];
      else next[field] = n;
    }
    updateScene(sceneKey, { vitals: next });
  }

  // ----- validation + save -----

  function validate(): string | null {
    if (!title.trim()) return "Title is required.";
    if (sceneKeys.length === 0) return "Add at least one scene.";
    if (!scenes[startSceneKey]) return "The start scene no longer exists — pick another.";
    for (const key of sceneKeys) {
      const scene = scenes[key];
      if (!scene.title.trim()) return `Scene "${key}" needs a title.`;
      for (const o of scene.options) {
        if (!o.text.trim()) return `An option in scene "${key}" is missing its text.`;
        if (o.next && !scenes[o.next])
          return `An option in scene "${key}" points to missing scene "${o.next}".`;
      }
    }
    return null;
  }

  async function handleSave() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await updateScenario(id!, {
        title,
        description,
        category,
        startSceneKey,
        scenes,
      });
      setNotice("Saved.");
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save scenario.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";
  const smallInput =
    "block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

  if (loading) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }
  if (error && !record) {
    return (
      <div className="p-6">
        <p className="text-rose-600">{error}</p>
        <Link to="/settings/scenarios" className="mt-3 inline-block text-sky-600 hover:underline">
          ← Back to scenarios
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="min-w-0">
            <Link
              to="/settings/scenarios"
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              ← All scenarios
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {title || "Untitled scenario"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
            {record && (
              <span
                className={
                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                  (record.status === "published"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600")
                }
              >
                {record.status === "published" ? "Published" : "Draft"}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-6 pb-16 pt-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {/* META */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Details</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600">Title</label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Category</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as ScenarioCategory);
                  markDirty();
                }}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_TYPE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Start scene
              </label>
              <select
                value={startSceneKey}
                onChange={(e) => {
                  setStartSceneKey(e.target.value);
                  markDirty();
                }}
                className={inputCls}
              >
                {sceneKeys.map((k) => (
                  <option key={k} value={k}>
                    {k} — {scenes[k].title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* SCENES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Scenes ({sceneKeys.length})
            </h2>
            <button
              onClick={addScene}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              + Add scene
            </button>
          </div>

          {sceneKeys.map((key) => {
            const scene = scenes[key];
            const isStart = key === startSceneKey;
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {key}
                    </span>
                    {isStart && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                        Start
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const nk = window.prompt("New scene key (letters, numbers, _):", key);
                        if (nk) renameScene(key, nk);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
                    >
                      Rename key
                    </button>
                    <button
                      onClick={() => deleteScene(key)}
                      className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Scene title
                    </label>
                    <input
                      value={scene.title}
                      onChange={(e) => updateScene(key, { title: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Narrative text
                    </label>
                    <textarea
                      value={scene.text}
                      onChange={(e) => updateScene(key, { text: e.target.value })}
                      rows={3}
                      className={inputCls}
                    />
                  </div>

                  {/* VITALS */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={scene.vitals != null}
                        onChange={(e) => toggleVitals(key, e.target.checked)}
                      />
                      Show vitals for this scene
                    </label>
                    {scene.vitals != null && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <VitalField label="HR" value={scene.vitals.hr} onChange={(v) => updateVital(key, "hr", v)} />
                        <VitalField label="SBP" value={scene.vitals.bp?.systolic} onChange={(v) => updateVital(key, "systolic", v)} />
                        <VitalField label="DBP" value={scene.vitals.bp?.diastolic} onChange={(v) => updateVital(key, "diastolic", v)} />
                        <VitalField label="RR" value={scene.vitals.rr} onChange={(v) => updateVital(key, "rr", v)} />
                        <VitalField label="SpO₂" value={scene.vitals.spo2} onChange={(v) => updateVital(key, "spo2", v)} />
                        <VitalField label="Temp" value={scene.vitals.temp} onChange={(v) => updateVital(key, "temp", v)} />
                        <VitalField label="GCS" value={scene.vitals.gcs} onChange={(v) => updateVital(key, "gcs", v)} />
                        <div>
                          <label className="block text-[0.65rem] font-medium text-slate-500">Skin</label>
                          <input
                            value={scene.vitals.skin ?? ""}
                            onChange={(e) => updateVital(key, "skin", e.target.value)}
                            className={smallInput}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OPTIONS */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-500">
                        Options ({scene.options.length})
                      </label>
                      <button
                        onClick={() => addOption(key)}
                        className="text-xs font-medium text-sky-600 hover:underline"
                      >
                        + Add option
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {scene.options.map((o, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-slate-200 p-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              value={o.text}
                              onChange={(e) => updateOption(key, i, { text: e.target.value })}
                              placeholder="Choice text shown to the student"
                              className={smallInput}
                            />
                            <button
                              onClick={() => deleteOption(key, i)}
                              className="text-xs font-medium text-rose-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <label className="block text-[0.65rem] font-medium text-slate-500">Leads to</label>
                              <select
                                value={o.next}
                                onChange={(e) => updateOption(key, i, { next: e.target.value })}
                                className={smallInput}
                              >
                                <option value="">— unset —</option>
                                {sceneKeys.map((k) => (
                                  <option key={k} value={k}>{k}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[0.65rem] font-medium text-slate-500">Points</label>
                              <input
                                type="number"
                                value={o.points}
                                onChange={(e) =>
                                  updateOption(key, i, {
                                    points: e.target.value === "" ? 0 : Number(e.target.value),
                                  })
                                }
                                className={smallInput}
                              />
                            </div>
                            <label className="flex items-end gap-1.5 pb-1 text-[0.7rem] font-medium text-slate-600">
                              <input
                                type="checkbox"
                                checked={o.isWrong ?? false}
                                onChange={(e) => updateOption(key, i, { isWrong: e.target.checked })}
                              />
                              Wrong choice
                            </label>
                          </div>
                          <div className="mt-2">
                            <label className="block text-[0.65rem] font-medium text-slate-500">
                              Feedback (shown after choosing)
                            </label>
                            <textarea
                              value={o.feedback ?? ""}
                              onChange={(e) => updateOption(key, i, { feedback: e.target.value })}
                              rows={2}
                              className={smallInput}
                            />
                          </div>
                        </div>
                      ))}
                      {scene.options.length === 0 && (
                        <p className="text-xs italic text-slate-400">
                          No options — this is a terminal (ending) scene.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <div className="flex justify-between">
          <button
            onClick={() => navigate("/settings/scenarios")}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </main>
    </div>
  );
}

function VitalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div>
      <label className="block text-[0.65rem] font-medium text-slate-500">{label}</label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500"
      />
    </div>
  );
}
