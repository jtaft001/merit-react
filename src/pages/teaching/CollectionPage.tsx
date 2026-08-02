import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { COLOR_CLASSES, getCollection, optionColor, type Field } from "../../teaching/schema";
import { deleteRecord, listRecords, updateRecord, type TeachingRecord } from "../../services/teachingService";
import { RecordForm, loadRelations, type RelationMap } from "./RecordForm";

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

/** A record field rendered as plain text, for search and string sorting. */
function displayText(field: Field, value: unknown, relations: RelationMap): string {
  if (value === undefined || value === null) return "";
  if (field.type === "relation") {
    const opts = relations[field.relationTo ?? ""] ?? [];
    return (value as string[]).map((id) => opts.find((o) => o.id === id)?.title ?? "").join(", ");
  }
  if (field.type === "multiselect") return (value as string[]).join(", ");
  if (field.type === "checkbox") return value ? "yes" : "";
  return String(value);
}

function compareRecords(
  a: TeachingRecord,
  b: TeachingRecord,
  field: Field,
  relations: RelationMap
): number {
  if (field.type === "number" || field.type === "money") {
    const an = a[field.key] == null ? -Infinity : Number(a[field.key]);
    const bn = b[field.key] == null ? -Infinity : Number(b[field.key]);
    return an - bn;
  }
  // Dates are "YYYY-MM-DD" strings, so lexicographic order is chronological.
  return displayText(field, a[field.key], relations)
    .toLowerCase()
    .localeCompare(displayText(field, b[field.key], relations).toLowerCase());
}

type SortState = { key: string; dir: "asc" | "desc" };

export default function CollectionPage() {
  const { type } = useParams<{ type: string }>();
  const def = type ? getCollection(type) : undefined;

  const [records, setRecords] = useState<TeachingRecord[]>([]);
  const [relations, setRelations] = useState<RelationMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<TeachingRecord | null | undefined>(undefined); // undefined = closed, null = new

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState | null>(null);

  const listFields = useMemo(() => def?.fields.filter((f) => f.inList) ?? [], [def]);
  const filterFields = useMemo(
    () => (def?.fields ?? []).filter((f) => f.type === "select" || f.type === "multiselect" || f.type === "relation"),
    [def]
  );

  // A "status-like" select (its options include "Done") gets a quick-complete
  // checkbox in each row — e.g. Tasks, Deadlines, Materials, Lesson Plans.
  const statusField = useMemo(
    () => (def?.fields ?? []).find((f) => f.type === "select" && f.options?.some((o) => o.value === "Done")),
    [def]
  );

  async function toggleDone(rec: TeachingRecord) {
    if (!def || !statusField) return;
    const done = String(rec[statusField.key] ?? "") === "Done";
    const next = done ? "Not started" : "Done";
    // Optimistic: update the row immediately, then persist.
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, [statusField.key]: next } : r)));
    try {
      await updateRecord(rec.id, def.id, { [statusField.key]: next });
    } catch (err) {
      console.error(err);
      setError("Could not update status.");
      await load();
    }
  }

  // Reset search/filters/sort when switching to a different database. Default
  // sort is the first date column (ascending) so calendars read chronologically.
  useEffect(() => {
    setSearch("");
    setFilters({});
    const dateField = def?.fields.find((f) => f.inList && f.type === "date");
    setSort(dateField ? { key: dateField.key, dir: "asc" } : null);
  }, [def]);

  const view = useMemo(() => {
    if (!def) return [] as TeachingRecord[];
    let rows = records;

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        def.fields.some(
          (f) =>
            (f.type === "text" || f.type === "longtext") &&
            String(r[f.key] ?? "").toLowerCase().includes(q)
        )
      );
    }

    for (const [key, val] of Object.entries(filters)) {
      if (!val) continue;
      const field = def.fields.find((f) => f.key === key);
      rows = rows.filter((r) => {
        const v = r[key];
        if (field?.type === "multiselect" || field?.type === "relation") {
          return Array.isArray(v) && v.includes(val);
        }
        return String(v ?? "") === val;
      });
    }

    if (sort) {
      const field = def.fields.find((f) => f.key === sort.key);
      if (field) {
        const dir = sort.dir === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => compareRecords(a, b, field, relations) * dir);
      }
    }
    return rows;
  }, [def, records, search, filters, sort, relations]);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev && prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  function filterOptions(field: Field): { value: string; label: string }[] {
    if (field.type === "relation") {
      return (relations[field.relationTo ?? ""] ?? []).map((o) => ({ value: o.id, label: o.title }));
    }
    return (field.options ?? []).map((o) => ({ value: o.value, label: o.value }));
  }

  const activeFilters = search.trim() !== "" || Object.values(filters).some(Boolean);

  const load = useCallback(async () => {
    if (!def) return;
    setLoading(true);
    setError("");
    try {
      const [rows, rel] = await Promise.all([listRecords(def.id), loadRelations(def)]);
      setRecords(rows);
      setRelations(rel);
    } catch (err) {
      console.error(err);
      setError("Could not load records.");
    } finally {
      setLoading(false);
    }
  }, [def]);

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

        {/* Filter / sort toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:ring-sky-500"
          />
          {filterFields.map((f) => (
            <select
              key={f.key}
              value={filters[f.key] ?? ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:ring-sky-500"
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {filterOptions(f).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {activeFilters && (
            <button
              onClick={() => {
                setSearch("");
                setFilters({});
              }}
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {view.length}
              {view.length !== records.length ? ` of ${records.length}` : ""} records
            </h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  {statusField && <th className="w-8 px-4 py-2" title="Done" aria-label="Done">✓</th>}
                  {listFields.map((f) => {
                    const active = sort?.key === f.key;
                    return (
                      <th key={f.key} className="px-4 py-2 whitespace-nowrap">
                        <button
                          onClick={() => toggleSort(f.key)}
                          className="inline-flex items-center gap-1 font-semibold hover:text-slate-900"
                        >
                          {f.label}
                          <span className="text-slate-400">{active ? (sort?.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {view.map((rec) => (
                  <tr key={rec.id} className="border-t border-slate-100 align-top">
                    {statusField && (
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={String(rec[statusField.key] ?? "") === "Done"}
                          onChange={() => toggleDone(rec)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          title="Mark done"
                        />
                      </td>
                    )}
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
                {view.length === 0 && !loading && (
                  <tr>
                    <td colSpan={listFields.length + 1 + (statusField ? 1 : 0)} className="px-4 py-6 text-center text-slate-500">
                      {records.length === 0
                        ? "No records yet. Click “+ New” to add one."
                        : "No records match the current filters."}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={listFields.length + 1 + (statusField ? 1 : 0)} className="px-4 py-6 text-center text-slate-500">
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
