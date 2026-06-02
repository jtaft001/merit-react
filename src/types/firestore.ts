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
  email?: string;
  status?: string;
  className?: string;
  authUid?: string;
  lastActivity?: unknown;
};
