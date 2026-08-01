// Shared Firestore doc shapes

export type Decision = {
  sceneKey: string;
  choiceText: string;
  points: number;
};

// ---------------------------------------------------------------------------
// Authored scenarios (admin-managed content stored in the `scenarios` doc)
//
// These mirror the built-in scene shapes in src/scenarios/shock/types.ts so an
// authored scenario can be played by ScenarioPlayer without a second data model.
// ---------------------------------------------------------------------------

export type ScenarioVitals = {
  hr?: number;
  bp?: { systolic: number; diastolic: number };
  rr?: number;
  spo2?: number;
  temp?: number;
  gcs?: number;
  skin?: string;
};

export type ScenarioSceneOption = {
  text: string;
  /** Scene key this choice leads to. */
  next: string;
  points: number;
  isWrong?: boolean;
  feedback?: string;
};

export type ScenarioScene = {
  title: string;
  text: string;
  vitals?: ScenarioVitals | null;
  options: ScenarioSceneOption[];
};

export type ScenarioCategory = "shock" | "trauma";
export type ScenarioStatus = "draft" | "published";

export type ScenarioDoc = {
  title?: string;
  description?: string;
  category?: ScenarioCategory;
  /** Human label shown on cards, e.g. "Shock" (legacy field kept for ScenarioPage). */
  type?: string;
  /** Legacy pointer to a built-in scenario id; unset for fully-authored scenarios. */
  scenarioKey?: string;
  status?: ScenarioStatus;
  /** Key of the first scene to show. Defaults to "initial". */
  startSceneKey?: string;
  scenes?: Record<string, ScenarioScene>;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AttemptDoc = {
  studentId?: string;
  studentName?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  score?: number;
  passed?: boolean;
  status?: string;
  currentSceneKey?: string;
  decisions?: Decision[];
  attemptedAt?: unknown;
};

export type StudentDoc = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  grade?: string;
  /**
   * The SCHOOL's student ID number (e.g. a district-assigned number).
   * This is intentionally NOT the same as the internal `studentId` used as the
   * Firestore/auth key for sessions, payroll, and attempts. Keep them separate.
   */
  studentNumber?: string;
  classId?: string;
  className?: string;
  authUid?: string;
  lastActivity?: unknown;
};

export type ClassDoc = {
  /** Display name, derived from courseType + period + schoolYear. */
  name?: string;
  /** One of the fixed course ids from config/courses.ts. */
  courseType?: string;
  /** Human label for the school year, e.g. "2025-2026". */
  schoolYear?: string;
  /** School period, 1-6. */
  period?: number;
  /** @deprecated legacy free-text grade; kept for older docs. */
  grade?: string;
  /** Daily meeting time, stored as "HH:MM" 24-hour strings. */
  dailyStart?: string;
  dailyEnd?: string;
  /** School-year term dates. */
  termStart?: unknown;
  termEnd?: unknown;
  status?: "active" | "archived";
  createdAt?: unknown;
  archivedAt?: unknown;
};
