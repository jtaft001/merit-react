import { useState } from "react";
import { getCollection, type CollectionDef, type Field } from "../../teaching/schema";
import {
  createRecord,
  listRecords,
  updateRecord,
  type TeachingRecord,
} from "../../services/teachingService";
import { uploadTeachingFile, deleteTeachingFile, type StoredFile } from "../../services/storageService";

function bytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/** Upload / view / remove a single stored file (e.g. a lesson-plan PDF). */
function FileField({
  value,
  onChange,
  scopeId,
}: {
  value: StoredFile | undefined;
  onChange: (v: StoredFile | null) => void;
  scopeId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      setError("Please choose a PDF.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const stored = await uploadTeachingFile("plans", scopeId, file);
      onChange(stored);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const old = value;
    onChange(null);
    if (old?.path) await deleteTeachingFile(old.path);
  }

  return (
    <div className="mt-1">
      {value?.url ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
          <span className="font-medium text-slate-700">📄 {value.name}</span>
          <span className="text-xs text-slate-400">{bytes(value.size)}</span>
          <a href={value.url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
            View
          </a>
          <button type="button" onClick={remove} className="text-rose-600 hover:underline">
            Remove
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {busy ? "Uploading…" : "Upload PDF"}
          <input type="file" accept="application/pdf" onChange={pick} disabled={busy} className="hidden" />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export type RelationMap = Record<string, { id: string; title: string }[]>;

const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

/** Load {id,title} options for every relation target of a collection. */
export async function loadRelations(def: CollectionDef): Promise<RelationMap> {
  const targets = Array.from(
    new Set(def.fields.filter((f) => f.type === "relation").map((f) => f.relationTo!))
  );
  const entries = await Promise.all(
    targets.map(async (t) => {
      const titleField = getCollection(t)?.titleField ?? "id";
      const opts = (await listRecords(t)).map((r) => ({
        id: r.id,
        title: (r[titleField] as string) || "(untitled)",
      }));
      return [t, opts] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** One editable input for a field. */
function FieldInput({
  field,
  value,
  onChange,
  relations,
  scopeId,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  relations: RelationMap;
  scopeId: string;
}) {
  switch (field.type) {
    case "file":
      return (
        <FileField
          value={(value as StoredFile) || undefined}
          onChange={(v) => onChange(v)}
          scopeId={scopeId}
        />
      );
    case "longtext":
    case "markdown":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={field.type === "markdown" ? 10 : 3}
          className={inputCls + (field.type === "markdown" ? " font-mono text-xs" : "")}
        />
      );
    case "number":
    case "money":
      return (
        <input
          type="number"
          step={field.type === "money" ? "0.01" : "any"}
          value={value === undefined || value === null ? "" : (value as number)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={inputCls}
        />
      );
    case "url":
      return (
        <input
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className={inputCls}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    case "checkbox":
      return (
        <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "select":
      return (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— none —</option>
          {field.optionGroups?.length
            ? field.optionGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
                </optgroup>
              ))
            : field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
        </select>
      );
    case "multiselect": {
      const selected = (value as string[]) ?? [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {field.options?.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className={
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (on
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {o.value}
              </button>
            );
          })}
        </div>
      );
    }
    case "relation": {
      const opts = relations[field.relationTo ?? ""] ?? [];
      const selected = (value as string[]) ?? [];
      const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
      if (opts.length === 0) {
        return <p className="mt-1 text-xs italic text-slate-400">No {field.relationTo} records to link yet.</p>;
      }
      return (
        <div className="mt-1 max-h-32 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.title}
            </label>
          ))}
        </div>
      );
    }
    default:
      return (
        <input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      );
  }
}

export function RecordForm({
  def,
  initial,
  defaults,
  relations,
  onCancel,
  onSaved,
}: {
  def: CollectionDef;
  /** Existing record to edit, or null to create a new one. */
  initial: TeachingRecord | null;
  /** Prefill values when creating (initial === null), e.g. a clicked calendar date. */
  defaults?: Record<string, unknown>;
  relations: RelationMap;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of def.fields) v[f.key] = initial ? initial[f.key] : defaults?.[f.key];
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Stable folder id for file uploads (existing record id, or a fresh id for new ones).
  const [scopeId] = useState(() => initial?.id || crypto.randomUUID());

  function set(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = values[def.titleField];
    if (!title || String(title).trim() === "") {
      setError(`${def.fields.find((f) => f.key === def.titleField)?.label ?? "Title"} is required.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (initial) await updateRecord(initial.id, def.id, values);
      else await createRecord(def.id, values);
      onSaved();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          {initial ? "Edit" : "New"} {def.label.replace(/s$/, "").toLowerCase()}
        </h2>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-slate-500 hover:underline">
          Cancel
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {def.fields.map((field) => (
          <div key={field.key} className={field.type === "longtext" || field.type === "markdown" ? "sm:col-span-2" : ""}>
            {field.type !== "checkbox" && (
              <label className="block text-sm font-medium text-slate-600">
                {field.label}
                {field.key === def.titleField && <span className="text-rose-500"> *</span>}
              </label>
            )}
            <FieldInput field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} relations={relations} scopeId={scopeId} />
            {field.help && <p className="mt-1 text-xs text-slate-400">{field.help}</p>}
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
