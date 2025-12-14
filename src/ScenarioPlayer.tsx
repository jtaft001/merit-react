import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  scenarioTypes as SCENARIO_TYPES,
  scenarios as SCENARIOS,
} from "./scenarios/shockScenarios";
import {
  createAttempt,
  updateAttempt,
  saveAttempt,
  fetchLatestAttemptForScenario,
  fetchLatestInProgressForStudent,
  type AttemptRecord,
} from "./services/attemptsService";
import { getStudentForUser } from "./services/studentService";
import { auth } from "./firebase";
import { useNavigate } from "react-router-dom";

// Tailwind-safe color map
const COLOR_MAP: Record<
  string,
  { bg: string; border: string; accent: string }
> = {
  hypovolemic: {
    bg: "bg-red-600",
    border: "border-red-600",
    accent: "text-red-400",
  },
  cardiogenic: {
    bg: "bg-rose-600",
    border: "border-rose-600",
    accent: "text-rose-400",
  },
  septic: {
    bg: "bg-amber-600",
    border: "border-amber-600",
    accent: "text-amber-400",
  },
  anaphylactic: {
    bg: "bg-fuchsia-600",
    border: "border-fuchsia-600",
    accent: "text-fuchsia-400",
  },
  neurogenic: {
    bg: "bg-blue-600",
    border: "border-blue-600",
    accent: "text-blue-400",
  },
  obstructive: {
    bg: "bg-indigo-600",
    border: "border-indigo-600",
    accent: "text-indigo-400",
  },
};

type ScenarioId = keyof typeof SCENARIOS;

type Decision = {
  sceneKey: string;
  choiceText: string;
  points: number;
};

type FeedbackData = {
  explanation: string;
  points: number;
};

interface ScenarioMeta {
  id: string;
  name: string;
  description?: string;
}

type StudentContext = {
  studentId: string;
  studentName: string;
};

const ScenarioPlayer: React.FC = () => {
  const { id: routeScenarioId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] =
    useState<ScenarioId | null>(null);
  const [currentSceneKey, setCurrentSceneKey] = useState("initial");
  const [score, setScore] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [studentContext, setStudentContext] = useState<StudentContext | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const resolveStudentContext = async (): Promise<StudentContext | null> => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setPlayerError("You must be logged in to start a scenario.");
        return null;
      }
      const studentDoc = await getStudentForUser(user);
      if (!studentDoc) {
        setPlayerError(
          "No student record linked to this account. Saving will be disabled until a student doc with authUid is added."
        );
        const ctx: StudentContext = {
          studentId: "anonymous",
          studentName: user.displayName || user.email || "Student",
        };
        setStudentContext(ctx);
        return ctx;
      }
      const ctx: StudentContext = {
        studentId: studentDoc.id,
        studentName:
          (studentDoc.name as string) ||
          user.displayName ||
          user.email ||
          "Student",
      };
      setPlayerError(null);
      setSaveMessage(null);
      setStudentContext(ctx);
      return ctx;
    } catch (err) {
      console.error("Error resolving student context", err);
      setPlayerError("Could not resolve student context; try again or check Firestore rules.");
      const user = auth.currentUser;
      if (user) {
        const ctx: StudentContext = {
          studentId: "anonymous",
          studentName: user.displayName || user.email || "Student",
        };
        setStudentContext(ctx);
        return ctx;
      }
      return null;
    }
  };

  const beginAttempt = async (scenarioId: ScenarioId, ctx: StudentContext) => {
    const scenarioMeta =
      SCENARIO_TYPES.find((s) => s.id === scenarioId) || null;
    try {
      const id = await createAttempt({
        studentId: ctx.studentId,
        studentName: ctx.studentName,
        scenarioId,
        scenarioTitle: scenarioMeta?.name || scenarioId,
        score: 0,
        passed: false,
        status: "In Progress",
      });
      setAttemptId(id);
    } catch (err) {
      console.error("Error starting attempt", err);
      setAttemptId(null);
    }
  };

  const persistProgress = async (data: {
    status?: string;
    score?: number;
    passed?: boolean;
  }) => {
    if (!studentContext) return;
    try {
      setSaveMessage(null);
      if (attemptId) {
        await updateAttempt(attemptId, {
          studentId: studentContext.studentId,
          studentName: studentContext.studentName,
          status: data.status ?? "In Progress",
          score: data.score,
          passed: data.passed,
        });
        setSaveMessage(
          data.status === "Complete" ? "Attempt submitted." : "Progress saved."
        );
        return;
      }

      // Fallback: create an attempt if we couldn't earlier
      if (selectedScenario) {
        const scenarioMeta =
          SCENARIO_TYPES.find((s) => s.id === selectedScenario) || null;
        await saveAttempt({
          studentId: studentContext.studentId,
          studentName: studentContext.studentName,
          scenarioId: selectedScenario,
          scenarioTitle: scenarioMeta?.name || selectedScenario,
          score: data.score,
          passed: data.passed,
          status: data.status ?? "In Progress",
        });
        setSaveMessage(
          data.status === "Complete" ? "Attempt submitted." : "Progress saved."
        );
      }
    } catch (err) {
      console.error("Error saving progress", err);
      setPlayerError("Could not save. Check your connection and try again.");
    }
  };

  const resetToMenu = async () => {
    const passed = typeof score === "number" ? score >= 80 : false;
    await persistProgress({
      status: currentSceneKey === "success" ? "Complete" : "In Progress",
      score,
      passed,
    });
    setSelectedScenario(null);
    setCurrentSceneKey("initial");
    setScore(0);
    setDecisions([]);
    setShowingFeedback(false);
    setFeedbackData(null);
    setAttemptId(null);
  };

  const hydrateFromAttempt = (attempt: AttemptRecord, id: ScenarioId) => {
    setSelectedScenario(id);
    setCurrentSceneKey(
      typeof attempt.currentSceneKey === "string" ? attempt.currentSceneKey : "initial"
    );
    setScore(typeof attempt.score === "number" ? attempt.score : 0);
    setDecisions(
      Array.isArray(attempt.decisions)
        ? (attempt.decisions as Decision[])
        : []
    );
    setShowingFeedback(false);
    setFeedbackData(null);
    setAttemptId(attempt.id);
  };

  const handleScenarioSelect = async (id: ScenarioId) => {
    const ctx = await resolveStudentContext();
    if (!ctx) {
      setSelectedScenario(null);
      return;
    }

    try {
      // Try to resume the latest in-progress attempt for this scenario
      const existing = await fetchLatestAttemptForScenario(ctx.studentId, id, "In Progress");
      if (existing) {
        hydrateFromAttempt(existing, id);
        setSaveMessage("Resumed your last in-progress attempt.");
        setResumeMessage(null);
        return;
      }
    } catch (err) {
      console.error("Error checking for existing attempt", err);
      setRouteNotice(
        "Could not check for an existing attempt. Starting a new run; saving may be limited until Firestore rules/indexes allow reads."
      );
    }

    // Otherwise start fresh
    setSelectedScenario(id);
    setCurrentSceneKey("initial");
    setScore(0);
    setDecisions([]);
    setShowingFeedback(false);
    setFeedbackData(null);
    setAttemptId(null);
    // Only create attempt if we have a real studentId
    if (ctx.studentId !== "anonymous") {
      await beginAttempt(id, ctx);
    }
  };

  const resumeLatestAnyScenario = async () => {
    const ctx = await resolveStudentContext();
    if (!ctx) return;
    setIsResuming(true);
    setResumeMessage(null);
    try {
      const latest = await fetchLatestInProgressForStudent(ctx.studentId);
      if (latest && latest.scenarioId && SCENARIOS[latest.scenarioId as ScenarioId]) {
        const sid = latest.scenarioId as ScenarioId;
        hydrateFromAttempt(latest, sid);
        setRouteNotice(null);
        setResumeMessage(`Resumed your last in-progress attempt for '${sid}'.`);
        navigate(`/scenario/${sid}`, { replace: true });
        return;
      }
      setResumeMessage("No in-progress attempt found to resume.");
    } catch (err) {
      console.error("Error resuming latest attempt", err);
      setResumeMessage("Could not resume. Check Firestore rules/indexes and try again.");
    } finally {
      setIsResuming(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (!routeScenarioId) {
        setRouteNotice(null);
        return;
      }
      const key = routeScenarioId as ScenarioId;
      if (SCENARIOS[key]) {
        setRouteNotice(`Loaded scenario '${key}' from URL`);
        await handleScenarioSelect(key);
        return;
      }

      try {
        // Unknown key: try to resume the latest in-progress attempt for this student
        const ctx = await resolveStudentContext();
        if (ctx) {
          const latest = await fetchLatestInProgressForStudent(ctx.studentId);
          if (latest && latest.scenarioId && SCENARIOS[latest.scenarioId as ScenarioId]) {
            const sid = latest.scenarioId as ScenarioId;
            hydrateFromAttempt(latest, sid);
            setRouteNotice(
              `Scenario '${routeScenarioId}' not found. Resumed your last in-progress attempt for '${sid}'.`
            );
            navigate(`/scenario/${sid}`, { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error("Error during route-based resume", err);
      }

      setRouteNotice(
        `Scenario '${routeScenarioId}' not found. Choose one below to begin.`
      );
      setSelectedScenario(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeScenarioId]);

  // MAIN MENU
  if (!selectedScenario) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-600 px-6 py-6 rounded-t-lg shadow-lg">
            <h1 className="text-3xl font-bold tracking-tight">
              EMR Shock Scenarios
            </h1>
            <p className="text-sm mt-2">
              Choose a shock type to practice assessment and decision-making.
            </p>
          </div>

          <div className="bg-gray-800 p-8 rounded-b-lg shadow-xl border border-gray-700">
            {playerError && (
              <div className="mb-4 rounded-md border border-amber-400 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {playerError}
              </div>
            )}
            {routeNotice && !playerError && (
              <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {routeNotice}
              </div>
            )}
            {saveMessage && (
              <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {saveMessage}
              </div>
            )}
            {resumeMessage && (
              <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {resumeMessage}
              </div>
            )}
            <div className="mb-4">
              <button
                onClick={resumeLatestAnyScenario}
                disabled={isResuming}
                className="rounded-lg border border-emerald-500/60 bg-emerald-600/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-60"
              >
                {isResuming ? "Resuming..." : "Resume last in-progress attempt"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {SCENARIO_TYPES.map((type) => {
                const colors = COLOR_MAP[type.id] ?? {
                  bg: "bg-gray-700",
                  border: "border-gray-700",
                  accent: "text-gray-300",
                };
                return (
                  <button
                    key={type.id}
                    onClick={() => handleScenarioSelect(type.id as ScenarioId)}
                    className={`${colors.bg} hover:opacity-90 text-white p-6 rounded-lg text-left transition transform hover:-translate-y-0.5`}
                  >
                    <h3 className="text-xl font-bold mb-2">{type.name}</h3>
                    <p className="text-sm opacity-90">{type.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-300">
              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-lg font-bold mb-3">
                  Skills you will practice
                </h3>
                <ul className="space-y-1">
                  <li>• Scene size-up and safety</li>
                  <li>• Shock recognition by vital signs</li>
                  <li>• Oxygen administration choices</li>
                  <li>• Bleeding control priorities</li>
                  <li>• When to call ALS early</li>
                  <li>• Patient positioning for breathing</li>
                  <li>• Safe EMR-level decisions</li>
                </ul>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-lg font-bold mb-3">
                  Shock types included
                </h3>
                <ul className="space-y-1">
                  <li>• Hypovolemic (blood loss)</li>
                  <li>• Cardiogenic (heart pump failure)</li>
                  <li>• Septic (severe infection)</li>
                  <li>• Anaphylactic (severe allergy)</li>
                  <li>• Neurogenic (spinal cord injury)</li>
                  <li>• Obstructive (blocked heart/lung function)</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 bg-gray-700 p-4 rounded-lg text-xs text-gray-300">
              <p>
                You work at EMR scope. You never start IVs or push medications.
                You focus on ABCs, oxygen, bleeding control, positioning, early
                ALS, and good handoffs.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCENARIO RUNNING
  const scenario = SCENARIOS[selectedScenario as ScenarioId];
  const scene = scenario[currentSceneKey as keyof typeof scenario];

  if (!scene) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-600 px-6 py-4 rounded-t-lg">
            <h1 className="text-2xl font-bold">Scenario Error</h1>
          </div>
          <div className="bg-gray-800 p-6 rounded-b-lg">
            <p className="mb-4">
              Scene "{currentSceneKey}" is missing for this scenario.
            </p>
            <button
              onClick={resetToMenu}
              className="mt-2 bg-red-700 px-4 py-2 rounded text-sm"
            >
              Back to menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  type Option = (typeof scene.options)[number];

  const handleChoice = (option: Option) => {
    if (option.points < 0 || option.isWrong) {
      const nextScene = scenario[option.next as keyof typeof scenario];

      setFeedbackData({
        explanation:
          option.feedback ||
          nextScene?.text ||
          "This action is unsafe for the patient.",
        points: option.points,
      });

      setShowingFeedback(true);
      // Persist current state as in-progress; score doesn't change here.
      void persistProgress({ status: "In Progress", score });
      return;
    }

    const newScore = score + option.points;
    const newDecisions = [
      ...decisions,
      {
        sceneKey: currentSceneKey,
        choiceText: option.text,
        points: option.points,
      },
    ];

    setScore(newScore);
    setDecisions(newDecisions);
    setCurrentSceneKey(option.next);

    const isCompletion = option.next === "success";
    const passed = newScore >= 80;
    void persistProgress({
      status: isCompletion ? "Complete" : "In Progress",
      score: newScore,
      passed: isCompletion ? passed : undefined,
      currentSceneKey: option.next,
      decisions: newDecisions,
    });
  };

  const handleTryAgain = () => {
    setShowingFeedback(false);
    setFeedbackData(null);
  };

  const handleSaveProgress = () => {
    void persistProgress({
      status: "In Progress",
      score,
      currentSceneKey,
      decisions,
    });
  };

  const handleSubmitAttempt = () => {
    const passed = score >= 80;
    void persistProgress({
      status: "Complete",
      score,
      passed,
      currentSceneKey,
      decisions,
    });
    setPlayerError(null);
  };

  // FEEDBACK SCREEN
  if (showingFeedback && feedbackData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-600 px-6 py-4 rounded-t-lg flex items-center justify-between">
            <h1 className="text-2xl font-bold">Incorrect choice</h1>
            <span className="text-sm opacity-90">
              Score:{" "}
              <span className="font-semibold text-yellow-200">{score}</span>
            </span>
          </div>

          <div className="bg-gray-800 p-6 border-l-4 border-red-600 rounded-b-lg">
            <h2 className="text-lg font-semibold mb-2">
              Why this can hurt the patient
            </h2>
            <p className="text-gray-200 mb-4 leading-relaxed">
              {feedbackData.explanation}
            </p>

            {feedbackData.points < 0 && (
              <p className="text-sm mb-4">
                Points change:{" "}
                <span className="font-bold text-red-400">
                  {feedbackData.points}
                </span>
              </p>
            )}

            <div className="bg-gray-700 p-4 rounded mb-4 text-sm text-gray-300">
              Think about airway, breathing, and circulation in order.
              Compare what you did to what an EMR is allowed to do safely.
            </div>

            <button
              onClick={handleTryAgain}
              className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded font-semibold text-sm"
            >
              Try again on this question
            </button>

            <button
              onClick={resetToMenu}
              className="w-full bg-gray-700 hover:bg-gray-600 py-3 rounded text-xs mt-3"
            >
              Return to scenario menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const meta =
    SCENARIO_TYPES.find((s) => s.id === selectedScenario) ||
    ({ name: selectedScenario } as ScenarioMeta);

  const colors =
    COLOR_MAP[selectedScenario as string] ?? COLOR_MAP["hypovolemic"];

  // BP normalization
  const vitals = scene.vitals || {};
  let bp: string | null = null;
  let systolicForColor: number | undefined;

  if (vitals.bp) {
    if (typeof vitals.bp === "string") {
      bp = vitals.bp;
      const s = parseInt(vitals.bp.split("/")[0], 10);
      if (!isNaN(s)) systolicForColor = s;
    } else {
      bp = `${vitals.bp.systolic}/${vitals.bp.diastolic}`;
      systolicForColor = vitals.bp.systolic;
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header bar */}
        <div
          className={`${colors.bg} px-6 py-4 rounded-t-lg flex justify-between items-center shadow-lg`}
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {meta.name}
            </h1>
            <p className="text-xs opacity-90">{scene.title}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide opacity-75">
                Score
              </p>
              <p className="text-xl font-bold text-yellow-200">{score}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveProgress}
                className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded text-xs font-semibold"
              >
                Save progress
              </button>
              <button
                onClick={handleSubmitAttempt}
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded text-xs font-semibold"
              >
                Submit as complete
              </button>
              <button
                onClick={resetToMenu}
                className="bg-red-700 hover:bg-red-800 px-4 py-2 rounded text-xs font-semibold"
              >
                Scenario menu
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className={`bg-gray-800 border-l-4 ${colors.border} p-6`}>
          {saveMessage && (
            <div className="mb-3 rounded-md border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {saveMessage}
            </div>
          )}
          {/* Scene title */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className={`text-xl font-bold ${colors.accent}`}>
              {scene.title}
            </h2>
          </div>

          {/* Vitals panel */}
          {(bp ||
            vitals.hr ||
            vitals.rr ||
            vitals.spo2 ||
            vitals.temp ||
            vitals.gcs ||
            vitals.skin) && (
            <div className="bg-gray-700 p-4 rounded-lg mb-6">
              <h3 className="text-xs font-semibold text-gray-300 mb-3 tracking-wide">
                VITAL SIGNS
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {bp && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      Blood pressure
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        systolicForColor && systolicForColor < 90
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {bp}
                    </p>
                  </div>
                )}
                {vitals.hr && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      Heart rate
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        vitals.hr > 120 || vitals.hr < 60
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {vitals.hr} bpm
                    </p>
                  </div>
                )}
                {vitals.rr && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      Respirations
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        vitals.rr > 24 || vitals.rr < 12
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {vitals.rr}/min
                    </p>
                  </div>
                )}
                {vitals.spo2 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      SpO₂
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        vitals.spo2 < 94
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {vitals.spo2}%
                    </p>
                  </div>
                )}
                {vitals.temp && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      Temperature
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        vitals.temp > 100.4 || vitals.temp < 96
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {vitals.temp}°F
                    </p>
                  </div>
                )}
                {vitals.gcs && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase">
                      GCS
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        vitals.gcs < 15
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {vitals.gcs}
                    </p>
                  </div>
                )}
                {vitals.skin && (
                  <div className="md:col-span-3 col-span-2">
                    <p className="text-xs text-gray-400 uppercase">
                      Skin
                    </p>
                    <p className="text-sm font-semibold text-gray-200">
                      {vitals.skin}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Narrative */}
          <div className="bg-gray-700 p-4 rounded-lg mb-6 text-sm leading-relaxed">
            <p>{scene.text}</p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {scene.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleChoice(opt)}
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 px-6 rounded text-left text-sm font-medium transition"
              >
                {opt.text}
              </button>
            ))}
          </div>
        </div>

        {/* Decision history */}
        {decisions.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-b-lg border-t border-gray-700 mt-1">
            <h3 className="font-bold mb-3 text-sm">
              Your decisions this run
            </h3>
            <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
              {decisions.map((d, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-gray-700 p-3 rounded"
                >
                  <span className="flex-1 pr-4">{d.choiceText}</span>
                  <span
                    className={
                      d.points > 0
                        ? "text-green-400 font-semibold"
                        : d.points < 0
                        ? "text-red-400 font-semibold"
                        : "text-gray-400"
                    }
                  >
                    {d.points > 0 ? "+" : ""}
                    {d.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScenarioPlayer;
