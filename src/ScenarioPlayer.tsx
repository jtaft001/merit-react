import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
  type AttemptPayload,
  type AttemptRecord,
} from "./services/attemptsService";
import { getStudentForUser } from "./services/studentService";
import { auth } from "./firebase";
import { useNavigate } from "react-router-dom";
import { CATEGORY_LABELS, COLOR_MAP, PASS_THRESHOLD } from "./config/scenarioConfig";

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

type ScenarioCategory = "shock" | "trauma";

type Option = {
  text: string;
  next: string;
  points: number;
  isWrong?: boolean;
  feedback?: string;
};

const ScenarioPlayer: React.FC = () => {
  const { id: routeScenarioId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [pendingNextScene, setPendingNextScene] = useState<string | null>(null);
  const [pendingPenalty, setPendingPenalty] = useState<number>(0);
  const [pendingChoiceText, setPendingChoiceText] = useState<string | null>(null);
  const initialCategory = ((): ScenarioCategory => {
    const param = searchParams.get("category");
    return param === "trauma" ? "trauma" : "shock";
  })();
  const [selectedCategory, setSelectedCategory] =
    useState<ScenarioCategory>(initialCategory);
  const [shuffledOptions, setShuffledOptions] = useState<Record<string, Option[]>>({});
  const [unknownScenarioNotice, setUnknownScenarioNotice] = useState<string | null>(null);

  const shuffleOptions = (options: Option[]): Option[] => {
    const arr = [...options];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const prepareShuffledOptions = (id: ScenarioId) => {
    const scenario = SCENARIOS[id];
    const map: Record<string, Option[]> = {};
    Object.entries(scenario).forEach(([sceneKey, scene]) => {
      map[sceneKey] = shuffleOptions(scene.options as Option[]);
    });
    setShuffledOptions(map);
  };

  const setCategoryForScenario = (id: ScenarioId) => {
    const meta = SCENARIO_TYPES.find((s) => s.id === id);
    if (meta?.category) setSelectedCategory(meta.category);
  };

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
    if (scenarioMeta?.category) {
      setSelectedCategory(scenarioMeta.category);
    }
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
    currentSceneKey?: string;
    decisions?: AttemptPayload["decisions"];
    attemptedAt?: "serverTimestamp";
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
          currentSceneKey: data.currentSceneKey,
          decisions: data.decisions,
          attemptedAt: data.attemptedAt,
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
          currentSceneKey: data.currentSceneKey,
          decisions: data.decisions,
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
    const passed = typeof score === "number" ? score >= PASS_THRESHOLD : false;
    await persistProgress({
      status: currentSceneKey === "success" ? "Complete" : "In Progress",
      score,
      passed,
      attemptedAt: "serverTimestamp",
    });
    setSelectedScenario(null);
    setCurrentSceneKey("initial");
    setScore(0);
    setDecisions([]);
    setShowingFeedback(false);
    setFeedbackData(null);
    setAttemptId(null);
    setPendingNextScene(null);
    setPendingPenalty(0);
    setPendingChoiceText(null);
    setShuffledOptions({});
  };

  const hydrateFromAttempt = (attempt: AttemptRecord, id: ScenarioId) => {
    setCategoryForScenario(id);
    prepareShuffledOptions(id);
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
    setPendingNextScene(null);
    setPendingPenalty(0);
    setPendingChoiceText(null);
  };

  const handleScenarioSelect = async (id: ScenarioId) => {
    setCategoryForScenario(id);
    prepareShuffledOptions(id);
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
    setPendingNextScene(null);
    setPendingPenalty(0);
    setPendingChoiceText(null);
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
        const meta = SCENARIO_TYPES.find((s) => s.id === sid);
        const categoryParam = meta?.category || selectedCategory;
        navigate(`/scenario/${sid}?category=${categoryParam}`, { replace: true });
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
        setUnknownScenarioNotice(null);
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
      setUnknownScenarioNotice(
        `Scenario '${routeScenarioId}' not found. Select a valid shock or trauma scenario to continue.`
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeScenarioId]);

  useEffect(() => {
    const param = searchParams.get("category");
    if (param === "trauma" || param === "shock") {
      setSelectedCategory(param);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = searchParams.get("category");
    if (current !== selectedCategory) {
      const next = new URLSearchParams(searchParams);
      next.set("category", selectedCategory);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedScenario) return;
    const scenario = SCENARIOS[selectedScenario];
    const scene = scenario?.[currentSceneKey as keyof typeof scenario];
    if (!scene) return;
    if (!shuffledOptions[currentSceneKey]) {
      setShuffledOptions((prev) => ({
        ...prev,
        [currentSceneKey]: shuffleOptions(scene.options as Option[]),
      }));
    }
  }, [selectedScenario, currentSceneKey, shuffledOptions]);

  // MAIN MENU
  if (!selectedScenario) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-600 px-6 py-6 rounded-t-lg shadow-lg">
            <h1 className="text-3xl font-bold tracking-tight">
              EMR Scenarios: Shock & Bleeding Control
            </h1>
            <p className="text-sm mt-2">
              Choose a scenario to practice assessment, bleeding control, and safe decision-making.
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
            {unknownScenarioNotice && (
              <div className="mb-4 rounded-md border border-amber-400 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {unknownScenarioNotice}
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
              <div className="flex flex-wrap gap-3 mb-4">
                <button
                  onClick={() => setSelectedCategory("shock")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                    selectedCategory === "shock"
                      ? "bg-red-600 border-red-500"
                      : "bg-gray-700 border-gray-600 hover:bg-gray-600"
                  }`}
                >
                  {CATEGORY_LABELS["shock"]}
                </button>
                <button
                  onClick={() => setSelectedCategory("trauma")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                    selectedCategory === "trauma"
                      ? "bg-emerald-700 border-emerald-500"
                      : "bg-gray-700 border-gray-600 hover:bg-gray-600"
                  }`}
                >
                  {CATEGORY_LABELS["trauma"]}
                </button>
              </div>

              {SCENARIO_TYPES.filter(
                (type) => type.category === selectedCategory
              ).map((type) => {
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
                  <li>• Bleeding control escalation</li>
                  <li>• When to call ALS early</li>
                  <li>• Patient positioning and splinting basics</li>
                  <li>• Distal circulation checks after bandaging</li>
                </ul>
              </div>

              <div className="bg-gray-700 p-5 rounded-lg">
                <h3 className="text-lg font-bold mb-3">
                  Available scenarios
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-gray-200 mb-1">Shock</p>
                    <ul className="space-y-1">
                      {SCENARIO_TYPES.filter((t) => t.category === "shock").map(
                        (type) => (
                          <li key={type.id}>• {type.name}</li>
                        )
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-200 mb-1">Trauma</p>
                    <ul className="space-y-1">
                      {SCENARIO_TYPES.filter(
                        (t) => t.category === "trauma"
                      ).map((type) => (
                        <li key={type.id}>• {type.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
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
      setPendingNextScene(option.next);
      setPendingPenalty(option.points);
      setPendingChoiceText(option.text);
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
    const passed = newScore >= PASS_THRESHOLD;
    void persistProgress({
      status: isCompletion ? "Complete" : "In Progress",
      score: newScore,
      passed: isCompletion ? passed : undefined,
      currentSceneKey: option.next,
      decisions: newDecisions,
      attemptedAt: "serverTimestamp",
    });
  };

  const handleContinueAfterFeedback = () => {
    const nextKey = pendingNextScene || currentSceneKey;
    const penalty = pendingPenalty || 0;
    const choiceText = pendingChoiceText;

    const newScore = score + penalty;
    const newDecisions =
      choiceText != null
        ? [
            ...decisions,
            {
              sceneKey: currentSceneKey,
              choiceText,
              points: penalty,
            },
          ]
        : decisions;

    setScore(newScore);
    setDecisions(newDecisions);
    setCurrentSceneKey(nextKey);
    setPendingNextScene(null);
    setPendingPenalty(0);
    setPendingChoiceText(null);
    setShowingFeedback(false);
    setFeedbackData(null);

    const isCompletion = nextKey === "success";
    const passed = newScore >= PASS_THRESHOLD;
    void persistProgress({
      status: isCompletion ? "Complete" : "In Progress",
      score: newScore,
      passed: isCompletion ? passed : undefined,
      currentSceneKey: nextKey,
      decisions: newDecisions,
      attemptedAt: "serverTimestamp",
    });
  };

  const handleSaveProgress = () => {
    void persistProgress({
      status: "In Progress",
      score,
      currentSceneKey,
      decisions,
      attemptedAt: "serverTimestamp",
    });
  };

  const handleSubmitAttempt = () => {
    const passed = score >= PASS_THRESHOLD;
    void persistProgress({
      status: "Complete",
      score,
      passed,
      currentSceneKey,
      decisions,
      attemptedAt: "serverTimestamp",
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
              onClick={handleContinueAfterFeedback}
              className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded font-semibold text-sm"
            >
              Continue
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
            {(shuffledOptions[currentSceneKey] || scene.options).map((opt, i) => (
              <button
                key={i}
                onClick={() => handleChoice(opt as Option)}
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
