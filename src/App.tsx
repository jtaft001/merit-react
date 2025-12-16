import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import LoginPage from "./LoginPage";
import StudentTrackingPage from "./pages/StudentTrackingPage";
import DashboardPage from "./pages/DashboardPage";
import TimeclockPage from "./pages/TimeclockPage";
import TimeclockDashboardPage from "./pages/TimeclockDashboardPage";
import TimeAttendancePage from "./pages/TimeAttendancePage";
import PayrollPage from "./pages/PayrollPage";
import PaystubPage from "./pages/PaystubPage";
import RewardsPage from "./pages/RewardsPage";
import ScenarioPlayer from "./ScenarioPlayer";
import ScenarioResultPage from "./pages/ScenarioResultPage";
import ContactSalesPage from "./pages/ContactSalesPage";
import LandingPage from "./pages/LandingPage";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading...</div>;
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/contact" element={<ContactSalesPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <div className="flex h-screen bg-slate-900 text-slate-100">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="px-4 py-6 text-xl font-semibold tracking-wide">MERIT EMS</div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/students"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Students
            </NavLink>

            <NavLink
              to="/time-attendance"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Time &amp; Attendance
            </NavLink>

            <NavLink
              to="/rewards"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Rewards
            </NavLink>

            <NavLink
              to="/scenario-result"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-emerald-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Scenario Result (test)
            </NavLink>

            <NavLink
              to="/contact"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-amber-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Contact Sales
            </NavLink>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage user={user} />} />
            <Route path="/students" element={<StudentTrackingPage />} />
            <Route path="/time-attendance" element={<TimeAttendancePage />} />
            <Route path="/timeclock" element={<TimeclockPage />} />
            <Route path="/timeclock-live" element={<TimeclockDashboardPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/payroll/:id" element={<PaystubPage />} />
            <Route path="/rewards" element={<RewardsPage />} />
            <Route path="/scenario" element={<ScenarioPlayer />} />
            <Route path="/scenario/:id" element={<ScenarioPlayer />} />
            <Route path="/contact" element={<ContactSalesPage />} />
            <Route
              path="/scenario-result"
              element={
                <ScenarioResultPage
                  currentScenarioId="example-scenario"
                  currentScenarioTitle="Example Scenario"
                  currentScore={85}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
