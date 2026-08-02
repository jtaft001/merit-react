import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  COLOR_CLASSES,
  getCollection,
  optionColor,
  type CollectionDef,
  type Field,
} from "../../teaching/schema";
import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
  type TeachingRecord,
} from "../../services/teachingService";

type RelationMap = Record<string, { id: string; title: string }[]>;

function Badge({ field, value }: { field: Field; value: string }) {
  const color = optionColor(field, value);
  return (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + COLOR_CLASSES[color]}>
      {value}
    </span>
  );
}

/** Only allow http/https links to be clickable; block javascript: etc. */
function safeHref(v: unknown): string | null {
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

function formatDate(v: unknown): string {
  if (!v || typeof v !== "string") return "—";
  const d = new Date(`${v}T00:00`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Render a field's stored value for the list/table view. */
function CellValue({
  field,
  value,
  relations,
}: {
  field: Field;
  value: unknown;
  relations: RelationMap;
}) {
  if (value === undefined || value === null || value === "") return <span className="text-slate-400">—</span>;

  switch (field.type) {
    case "select":
      return <Badge field={field} value={String(value)} />;
    case "multiselect":
      return (
        <div className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => (
            <Badge key={v} field={field} value={v} />
          ))}
        </div>
      );
    case "relation": {
      const opts = relations[field.relationTo ?? ""] ?? [];
      const ids = value as string[];
      const titles = ids.map((id) => opts.find((o) => o.id === id)?.title ?? "(missing)");
      return <span className="text-slate-700">{titles.join(", ")}</span>;
    }
    case "date":
      return <span className="text-slate-700">{formatDate(value)}</span>;
    case "checkbox":
      return value ? <span className="text-emerald-600">✓</span> : <span className="text-slate-400">—</span>;
    case "money":
      return <span className="text-slate-700">${Number(value).toFixed(2)}</span>;
    case "url": {
      const href = safeHref(value);
      return href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
          link
        </a>
      ) : (
        <span className="text-slate-700">{String(value)}</span>
      );
    }
    default:
      return <span className="text-slate-700">{String(value)}</span>;
  }
}

const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500";

/** One editable input for a field. */
function FieldInput({
  field,
  value,
  onChange,
  relations,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  relations: RelationMap;
}) {
  switch (field.type) {
    case "longtext":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputCls}
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
          {field.options?.map((o) => (
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
        <input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
  }
}

function RecordForm({
  def,
  initial,
  relations,
  onCancel,
  onSaved,
}: {
  def: CollectionDef;
  initial: TeachingRecord | null;
  relations: RelationMap;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of def.fields) v[f.key] = initial ? initial[f.key] : undefined;
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          <div key={field.key} className={field.type === "longtext" ? "sm:col-span-2" : ""}>
            {field.type !== "checkbox" && (
              <label className="block text-sm font-medium text-slate-600">
                {field.label}
                {field.key === def.titleField && <span className="text-rose-500"> *</span>}
              </label>
            )}
            <FieldInput field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} relations={relations} />
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

export default function CollectionPage() {
  const { type } = useParams<{ type: string }>();
  const def = type ? getCollection(type) : undefined;

  const [records, setRecords] = useState<TeachingRecord[]>([]);
  const [relations, setRelations] = useState<RelationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<TeachingRecord | null | undefined>(undefined); // undefined = closed, null = new

  const listFields = useMemo(() => def?.fields.filter((f) => f.inList) ?? [], [def]);
  const relationTargets = useMemo(
    () => Array.from(new Set((def?.fields ?? []).filter((f) => f.type === "relation").map((f) => f.relationTo!))),
    [def]
  );

  const load = useCallback(async () => {
    if (!def) return;
    setLoading(true);
    setError("");
    try {
      const [rows, relEntries] = await Promise.all([
        listRecords(def.id),
        Promise.all(
          relationTargets.map(async (t) => {
            const opts = (await listRecords(t)).map((r) => ({
              id: r.id,
              title: (r[getCollection(t)?.titleField ?? "id"] as string) || "(untitled)",
            }));
            return [t, opts] as const;
          })
        ),
      ]);
      setRecords(rows);
      setRelations(Object.fromEntries(relEntries));
    } catch (err) {
      console.error(err);
      setError("Could not load records.");
    } finally {
      setLoading(false);
    }
  }, [def, relationTargets]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(rec: TeachingRecord) {
    const title = (rec[def!.titleField] as string) || "this record";
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteRecord(rec.id);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not delete record.");
    }
  }

  if (!def) {
    return (
      <div className="p-6">
        <p className="text-rose-600">Unknown database.</p>
        <Link to="/teaching" className="mt-3 inline-block text-sky-600 hover:underline">
          ← Teaching HQ
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/teaching" className="text-xs font-medium text-sky-600 hover:underline">
              ← Teaching HQ
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">
              {def.icon} {def.label}
            </h1>
            <p className="text-sm text-slate-500">{def.blurb}</p>
          </div>
          {editing === undefined && (
            <button
              onClick={() => setEditing(null)}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
            >
              + New
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 pb-12 pt-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {editing !== undefined && (
          <RecordForm
            def={def}
            initial={editing}
            relations={relations}
            onCancel={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              void load();
            }}
          />
        )}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">{records.length} records</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  {listFields.map((f) => (
                    <th key={f.key} className="px-4 py-2 whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id} className="border-t border-slate-100 align-top">
                    {listFields.map((f) => (
                      <td key={f.key} className="px-4 py-2">
                        <CellValue field={f} value={rec[f.key]} relations={relations} />
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditing(rec)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rec)}
                          className="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && !loading && (
                  <tr>
                    <td colSpan={listFields.length + 1} className="px-4 py-6 text-center text-slate-500">
                      No records yet. Click “+ New” to add one.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={listFields.length + 1} className="px-4 py-6 text-center text-slate-500">
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
