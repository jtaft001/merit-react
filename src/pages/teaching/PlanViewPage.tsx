import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getCollection } from "../../teaching/schema";
import { getRecord, type TeachingRecord } from "../../services/teachingService";

export default function PlanViewPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TeachingRecord | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const rec = await getRecord(id);
        if (cancelled) return;
        if (!rec) {
          setError("Record not found.");
          return;
        }
        setRecord(rec);
        const md = typeof rec.content === "string" ? rec.content : "";
        // Render markdown → HTML, then sanitize before inserting.
        const rawHtml = await marked.parse(md);
        if (!cancelled) setHtml(DOMPurify.sanitize(rawHtml));
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load the document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const def = record ? getCollection(record.type) : undefined;
  const title = record && def ? (record[def.titleField] as string) : "Document";
  const backTo = record ? `/teaching/db/${record.type}` : "/teaching";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="min-w-0">
            <Link to={backTo} className="text-xs font-medium text-sky-600 hover:underline">
              ← Back
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          {record && (
            <Link
              to={backTo}
              className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit in table
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-6">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}
        {!loading && !error && !html && (
          <p className="text-sm italic text-slate-400">This lesson plan has no document text yet.</p>
        )}
        {html && (
          <article
            className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-sky-600"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </main>
    </div>
  );
}
