import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

type FormState = {
  name: string;
  email: string;
  organization: string;
  message: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  organization: "",
  message: "",
};

export default function ContactSalesPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      await addDoc(collection(db, "sales_leads"), {
        ...form,
        createdAt: serverTimestamp(),
        source: "in-app",
        notify: ["jonathan.dayre.taft@gmail.com"],
      });
      setStatus("Thanks! We received your request and will reach out soon.");
      setForm(initialState);
    } catch (err) {
      console.error(err);
      setStatus("Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600/20 via-slate-900 to-slate-950 p-5 shadow-lg shadow-emerald-900/20">
        <h1 className="text-xl font-semibold text-emerald-100">Contact Sales</h1>
        <p className="text-sm text-emerald-50/80 mt-1">
          Tell us about your program and we&apos;ll follow up with pricing and a demo.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4 max-w-2xl"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Full name
            <input
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoComplete="name"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Work email
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm text-slate-700">
            School / organization
            <input
              required
              value={form.organization}
              onChange={(e) => updateField("organization", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoComplete="organization"
            />
          </label>
        </div>
        <label className="block text-sm text-slate-700">
          What do you need? (demo, pricing, number of students, timeline)
          <textarea
            required
            value={form.message}
            onChange={(e) => updateField("message", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[120px]"
          />
        </label>
        {status && (
          <div className="rounded-md border border-emerald-500/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {status}
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-emerald-600 px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </div>
  );
}
