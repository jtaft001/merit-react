// Shared Firestore doc shapes

export type Decision = {
  sceneKey: string;
  choiceText: string;
  points: number;
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
  name?: string;
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
