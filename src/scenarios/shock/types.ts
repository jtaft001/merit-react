// src/scenarios/shock/types.ts

export type Vitals = {
  hr?: number;
  bp?: { systolic?: number; diastolic?: number } | string;
  rr?: number;
  spo2?: number;
  temp?: number;
  gcs?: number;
  skin?: string;
};

export type SceneOption = {
  text: string;
  next: string;
  points: number;
  isWrong?: boolean;
  feedback?: string;
};

export type Scene = {
  title: string;
  text: string;
  vitals?: Vitals | null;
  options: SceneOption[];
};

export type Scenario = Record<string, Scene>;

export type ScenarioKey =
  | "hypovolemic"
  | "cardiogenic"
  | "septic"
  | "anaphylactic"
  | "neurogenic"
  | "obstructive"
  | "power-tool-laceration"
  | "arterial-thigh-bleed"
  | "venous-leg-glass"
  | "capillary-knee-abrasion"
  | "bleeding-with-fracture"
  | "tight-bandage-hand";
