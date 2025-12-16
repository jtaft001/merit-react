import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-emerald-600 text-center text-lg font-bold leading-9 text-white">
              M
            </span>
            <div>
              <p className="text-sm font-semibold">MERIT · Medical Education Resource and Instruction Toolkit</p>
              <p className="text-xs text-slate-400">Scenario-based EMS learning for schools</p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-slate-200 md:flex">
            <a href="#home" className="hover:text-emerald-300">
              Home
            </a>
            <a href="#product" className="hover:text-emerald-300">
              Product Info
            </a>
            <a href="#contact" className="hover:text-emerald-300">
              Contact Us
            </a>
          </nav>

          <button
            onClick={() => navigate("/login")}
            className="rounded-lg border border-emerald-500/70 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Log In
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 space-y-12">
        <section id="home" className="rounded-2xl border border-emerald-700/40 bg-slate-950 p-4 shadow-lg shadow-emerald-900/30">
          <img
            src="/merit-banner.png"
            alt="MERIT EMS banner"
            className="w-full rounded-xl border border-slate-800 shadow-lg"
          />
        </section>

        <section id="product" className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Product info</p>
            <h2 className="text-2xl font-semibold text-white">Built for instructors and students</h2>
            <p className="text-sm text-slate-300">
              Scenario-based learning with clear scoring, persistence, and oversight. Connects to Firebase for auth and data.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Interactive scenarios",
                desc: "Branching cases with vitals, feedback on unsafe choices, and auto-saved attempts.",
              },
              {
                title: "Instructor dashboards",
                desc: "View attempts, attendance, payroll/timeclock, and reward redemptions in one place.",
              },
              {
                title: "School-ready",
                desc: "Role-based auth, Firestore-backed, and simple seeding scripts to demo or preload content.",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm">
                <h3 className="text-base font-semibold text-emerald-100">{card.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="contact"
          className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow md:grid-cols-2"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Contact us</p>
            <h2 className="text-2xl font-semibold text-white">Ready to bring this to your program?</h2>
            <p className="mt-2 text-sm text-slate-300">
              We&apos;ll set up a demo and share pricing tailored to your class size.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              <li>• Live demo with your instructors</li>
              <li>• Scenario seeding for your program</li>
              <li>• Simple browser-based rollout</li>
            </ul>
          </div>
          <div className="flex items-center justify-center">
            <button
              onClick={() => navigate("/contact")}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow hover:bg-emerald-500 md:w-auto"
            >
              Contact Sales
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
