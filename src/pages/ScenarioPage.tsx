import { useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { saveAttempt } from "../services/attemptsService";

// Simple list of scenarios for now
const SCENARIOS = [
  {
    id: "hypovolemic-shock",
    title: "Hypovolemic Shock",
    description: "Bleeding trauma, control hemorrhage and call for help."
  },
  {
    id: "cardiogenic-shock",
    title: "Cardiogenic Shock",
    description: "Heart pump problem, early ALS and rapid transport."
  },
  {
    id: "septic-shock",
    title: "Septic Shock",
    description: "Severe infection, early recognition and transport."
  },
  {
    id: "anaphylactic-shock",
    title: "Anaphylactic Shock",
    description: "Severe allergy, EpiPen and airway support."
  },
  {
    id: "neurogenic-shock",
    title: "Neurogenic Shock",
    description: "Spinal injury with low blood pressure and warm skin."
  },
  {
    id: "obstructive-shock",
    title: "Obstructive Shock",
    description: "Blocked heart or lungs, fast ALS activation."
  }
];

type Scenario = {
  id: string;
  title: string;
  description: string;
};

type Stage = "idle" | "running" | "review" | "submitted";

type ScenarioPageProps = {
  user: User;
};

type LinkedStudent = {
  id: string;
  name: string;
};

type StudentDoc = {
  name?: string;
};

async function getStudentForUser(user: User): Promise<LinkedStudent | null> {
  const colRef = collection(db, "students");
  const q = query(colRef, where("authUid", "==", user.uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const docSnap = snapshot.docs[0];
  const data = docSnap.data() as StudentDoc;

  return {
    id: docSnap.id,
    name: data.name ?? ""
  };
}

function ScenarioPage({ user }: ScenarioPageProps) {
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [score, setScore] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalSteps = 3;

  function startScenario(scenario: Scenario) {
    setSelected(scenario);
    setStepIndex(0);
    setStage("running");
    setScore(0);
    setErrorMsg(null);
  }

  function nextStep() {
    if (stepIndex + 1 < totalSteps) {
      setStepIndex(stepIndex + 1);
    } else {
      setStage("review");
    }
  }

  function reviewScenarioAgain() {
    setStage("running");
    setStepIndex(0);
    setErrorMsg(null);
  }

  async function submitAttempt() {
    if (!selected) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const student = await getStudentForUser(user);
      if (!student) {
        setErrorMsg(
          "No student record linked to this account. Please add authUid to the student in Firestore."
        );
        setIsSubmitting(false);
        return;
      }

      const passed = score >= 70;

      await saveAttempt({
        studentId: student.id,
        studentName: student.name,
        scenarioId: selected.id,
        scenarioTitle: selected.title,
        score,
        passed
      });

      setStage("submitted");
    } catch (err) {
      console.error("Error submitting attempt", err);
      setErrorMsg("Could not submit attempt. Check the console for details.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function backToMenu() {
    setSelected(null);
    setStage("idle");
    setStepIndex(0);
    setScore(0);
    setErrorMsg(null);
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header
        style={{
          backgroundColor: "#c62828",
          color: "white",
          padding: "1rem 1.5rem",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.75rem" }}>EMR Shock Scenarios</h1>
        <p style={{ margin: "0.5rem 0 0" }}>
          Choose a shock type, run the scenario, then submit your attempt at the end.
        </p>
      </header>

      {!selected && (
        <div>
          <p style={{ marginBottom: "1rem", color: "#ccc" }}>
            Click a card to start a scenario.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem"
            }}
          >
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => startScenario(s)}
                style={{
                  textAlign: "left",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: "#263238",
                  color: "white"
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{s.title}</h2>
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                  {s.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem 1.5rem",
            borderRadius: "0.5rem",
            backgroundColor: "#1e272e",
            color: "white"
          }}
        >
          <div
            style={{
              marginBottom: "0.75rem",
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>{selected.title}</h2>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.9rem",
                  color: "#b0bec5"
                }}
              >
                Student: {user.displayName || user.email}
              </p>
            </div>
            <button
              onClick={backToMenu}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "0.35rem",
                border: "1px solid #546e7a",
                backgroundColor: "transparent",
                color: "white",
                cursor: "pointer",
                height: "fit-content"
              }}
            >
              Back to scenarios
            </button>
          </div>

          {stage === "running" && (
            <div>
              <p style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                Step {stepIndex + 1} of {totalSteps}
              </p>

              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "#263238",
                  marginBottom: "1rem"
                }}
              >
                <p style={{ margin: 0 }}>
                  Here you would show the actual question or decision for this step.
                  For now this is placeholder text so you can test the flow.
                </p>
              </div>

              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Score for this attempt (0 to 100):
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setScore(Number(e.target.value))}
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: "0.3rem",
                  border: "1px solid #455a64",
                  marginBottom: "1rem",
                  backgroundColor: "#111",
                  color: "white"
                }}
              />

              <button
                onClick={nextStep}
                style={{
                  padding: "0.6rem 1.2rem",
                  borderRadius: "0.4rem",
                  border: "none",
                  backgroundColor: "#1976d2",
                  color: "white",
                  cursor: "pointer"
                }}
              >
                {stepIndex + 1 < totalSteps ? "Next step" : "Finish scenario"}
              </button>
            </div>
          )}

          {stage === "review" && (
            <div>
              <h3>Review your scenario</h3>
              <p style={{ marginBottom: "0.75rem" }}>
                You have reached the end of this scenario. You can review again or submit this attempt.
              </p>

              <p style={{ marginBottom: "0.5rem" }}>
                Scenario: <strong>{selected.title}</strong>
              </p>
              <p style={{ marginBottom: "0.5rem" }}>
                Score: <strong>{score}</strong>
              </p>
              <p style={{ marginBottom: "1rem" }}>
                Result: <strong>{score >= 70 ? "Pass" : "Not yet"}</strong>
              </p>

              {errorMsg && (
                <p style={{ color: "#ef9a9a", marginBottom: "0.75rem" }}>{errorMsg}</p>
              )}

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={reviewScenarioAgain}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "0.4rem",
                    border: "1px solid #455a64",
                    backgroundColor: "transparent",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Review scenario
                </button>

                <button
                  onClick={submitAttempt}
                  disabled={isSubmitting}
                  style={{
                    padding: "0.6rem 1.4rem",
                    borderRadius: "0.4rem",
                    border: "none",
                    backgroundColor: "#2e7d32",
                    color: "white",
                    cursor: "pointer",
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                >
                  {isSubmitting ? "Submitting..." : "Submit attempt"}
                </button>
              </div>
            </div>
          )}

          {stage === "submitted" && (
            <div>
              <h3>Attempt submitted</h3>
              <p style={{ marginBottom: "0.75rem" }}>
                This attempt has been written to the attempts collection. You can return to the menu or run another scenario.
              </p>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={backToMenu}
                  style={{
                    padding: "0.6rem 1.2rem",
                    borderRadius: "0.4rem",
                    border: "1px solid #455a64",
                    backgroundColor: "transparent",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Back to scenarios
                </button>
                <button
                  onClick={() => {
                    setStage("running");
                    setStepIndex(0);
                    setScore(0);
                    setErrorMsg(null);
                  }}
                  style={{
                    padding: "0.6rem 1.4rem",
                    borderRadius: "0.4rem",
                    border: "none",
                    backgroundColor: "#1976d2",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Run again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ScenarioPage;
