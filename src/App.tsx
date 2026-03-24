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
import ScenarioPage from "./pages/ScenarioPage";
import SettingsPage from "./pages/SettingsPage";
import AddUserPage from "./pages/AddUserPage";
import NfcClockPage from "./pages/NfcClockPage";
import NfcImportPage from "./pages/NfcImportPage";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const tokenResult = await u.getIdTokenResult();
        setIsAdmin(tokenResult.claims.staff === true);
      } else {
        setIsAdmin(false);
      }
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
          <Route path="/nfc-login" element={<NfcClockPage />} />
          <Route path="/nfc-clock" element={<NfcClockPage />} />
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
              to="/scenarios"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Scenarios
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/students"
                className={({ isActive }) =>
                  "block px-3 py-2 rounded-xl text-sm " +
                  (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
                }
              >
                Students
              </NavLink>
            )}

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
              to="/payroll"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              {isAdmin ? "Payroll" : "My Paystubs"}
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

            {isAdmin && (
              <NavLink
                to="/scenario-result"
                className={({ isActive }) =>
                  "block px-3 py-2 rounded-xl text-sm " +
                  (isActive ? "bg-emerald-500 text-white" : "text-slate-200 hover:bg-slate-800")
                }
              >
                Scenario Result (test)
              </NavLink>
            )}

            <NavLink
              to="/contact"
              className={({ isActive }) =>
                "block px-3 py-2 rounded-xl text-sm " +
                (isActive ? "bg-amber-500 text-white" : "text-slate-200 hover:bg-slate-800")
              }
            >
              Contact Sales
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  "block px-3 py-2 rounded-xl text-sm " +
                  (isActive ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-slate-800")
                }
              >
                Settings
              </NavLink>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/nfc-login" element={<NfcClockPage />} />
            <Route path="/nfc-clock" element={<NfcClockPage />} />
            <Route path="/" element={<DashboardPage user={user} />} />
            <Route path="/scenarios" element={<ScenarioPage />} />
            <Route path="/students" element={isAdmin ? <StudentTrackingPage isAdmin={true} /> : <div className="p-6 text-slate-400">Access denied.</div>} />
            <Route path="/time-attendance" element={<TimeAttendancePage />} />
            <Route path="/timeclock" element={<TimeclockPage />} />
            <Route path="/timeclock-live" element={<TimeclockDashboardPage />} />
            <Route path="/payroll" element={<PayrollPage isAdmin={isAdmin} userId={user.uid} />} />
            <Route path="/payroll/:id" element={<PaystubPage />} />
            <Route path="/rewards" element={<RewardsPage />} />
            <Route path="/scenario" element={<ScenarioPlayer />} />
            <Route path="/scenario/:id" element={<ScenarioPlayer />} />
            <Route path="/contact" element={<ContactSalesPage />} />
            <Route path="/settings" element={isAdmin ? <SettingsPage /> : <div className="p-6 text-slate-400">Access denied.</div>} />
            <Route path="/settings/add-user" element={isAdmin ? <AddUserPage /> : <div className="p-6 text-slate-400">Access denied.</div>} />
            <Route path="/settings/nfc-import" element={isAdmin ? <NfcImportPage /> : <div className="p-6 text-slate-400">Access denied.</div>} />
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
