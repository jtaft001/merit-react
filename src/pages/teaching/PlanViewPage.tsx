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
  const pdf = record?.pdf as { url?: string; name?: string } | undefined;
  const hasPdf = !!pdf?.url;
  const wide = hasPdf ? "max-w-5xl" : "max-w-3xl";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className={"mx-auto flex items-center justify-between px-6 py-4 " + wide}>
          <div className="min-w-0">
            <Link to={backTo} className="text-xs font-medium text-sky-600 hover:underline">
              ← Back
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {hasPdf && (
              <a
                href={pdf!.url}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
              >
                Open PDF ↗
              </a>
            )}
            {record && (
              <Link
                to={backTo}
                className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit in table
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className={"mx-auto px-6 pb-16 pt-6 " + wide}>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* PDF takes priority; text is a fallback for plans without a PDF. */}
        {!loading && !error && hasPdf && (
          <iframe
            src={pdf!.url}
            title={pdf!.name || "Lesson plan PDF"}
            className="h-[calc(100vh-10rem)] w-full rounded-lg border border-slate-200 bg-white"
          />
        )}
        {!loading && !error && !hasPdf && html && (
          <article
            className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-sky-600"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {!loading && !error && !hasPdf && !html && (
          <p className="text-sm italic text-slate-400">No PDF uploaded yet. Open the record and upload the plan PDF.</p>
        )}
      </main>
    </div>
  );
}
