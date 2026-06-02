import type { Scenario } from "./shock/types";
import { hypovolemicScenario } from "./shock/hypovolemic";
import { cardiogenicScenario } from "./shock/cardiogenic";
import { septicScenario } from "./shock/septic";
import { anaphylacticScenario } from "./shock/anaphylactic";
import { neurogenicScenario } from "./shock/neurogenic";
import { obstructiveScenario } from "./shock/obstructive";
import {
  arterialThighScenario,
  bleedingFractureScenario,
  capillaryKneeScenario,
  powerToolLacerationScenario,
  tightBandageScenario,
  venousLegScenario,
} from "./externalBleeding";

export type ScenarioColors = { bg: string; border: string; accent: string };

export const scenarioTypes = [
  {
    id: "hypovolemic",
    name: "Hypovolemic Shock",
    description: "Bleeding trauma, control hemorrhage and call for help",
    category: "shock" as const,
    colors: { bg: "bg-red-600", border: "border-red-600", accent: "text-red-400" } as ScenarioColors,
  },
  {
    id: "cardiogenic",
    name: "Cardiogenic Shock",
    description: "Heart problem, recognize and get ALS fast",
    category: "shock" as const,
    colors: { bg: "bg-rose-600", border: "border-rose-600", accent: "text-rose-400" } as ScenarioColors,
  },
  {
    id: "septic",
    name: "Septic Shock",
    description: "Severe infection, early recognition saves lives",
    category: "shock" as const,
    colors: { bg: "bg-amber-600", border: "border-amber-600", accent: "text-amber-400" } as ScenarioColors,
  },
  {
    id: "anaphylactic",
    name: "Anaphylactic Shock",
    description: "Severe allergy, assist with EpiPen if available",
    category: "shock" as const,
    colors: { bg: "bg-fuchsia-600", border: "border-fuchsia-600", accent: "text-fuchsia-400" } as ScenarioColors,
  },
  {
    id: "neurogenic",
    name: "Neurogenic Shock",
    description: "Spinal injury, different from other shock types",
    category: "shock" as const,
    colors: { bg: "bg-blue-600", border: "border-blue-600", accent: "text-blue-400" } as ScenarioColors,
  },
  {
    id: "obstructive",
    name: "Obstructive Shock",
    description: "Chest injury, recognize life threat early",
    category: "shock" as const,
    colors: { bg: "bg-indigo-600", border: "border-indigo-600", accent: "text-indigo-400" } as ScenarioColors,
  },
  {
    id: "power-tool-laceration",
    name: "Power Tool Laceration",
    description: "Escalate bleeding control when direct pressure fails",
    category: "trauma" as const,
    colors: { bg: "bg-amber-700", border: "border-amber-700", accent: "text-amber-300" } as ScenarioColors,
  },
  {
    id: "arterial-thigh-bleed",
    name: "Arterial Thigh Bleed",
    description: "Spurting arterial hemorrhage needs immediate tourniquet",
    category: "trauma" as const,
    colors: { bg: "bg-orange-700", border: "border-orange-700", accent: "text-orange-300" } as ScenarioColors,
  },
  {
    id: "venous-leg-glass",
    name: "Venous Leg Laceration",
    description: "Control steady venous bleeding with pressure bandage",
    category: "trauma" as const,
    colors: { bg: "bg-yellow-700", border: "border-yellow-700", accent: "text-yellow-200" } as ScenarioColors,
  },
  {
    id: "capillary-knee-abrasion",
    name: "Capillary Knee Abrasion",
    description: "Minor oozing with contamination risk",
    category: "trauma" as const,
    colors: { bg: "bg-lime-700", border: "border-lime-700", accent: "text-lime-200" } as ScenarioColors,
  },
  {
    id: "bleeding-with-fracture",
    name: "Bleeding with Fracture",
    description: "Control bleeding without worsening a deformity",
    category: "trauma" as const,
    colors: { bg: "bg-teal-700", border: "border-teal-700", accent: "text-teal-200" } as ScenarioColors,
  },
  {
    id: "tight-bandage-hand",
    name: "Bandage Too Tight",
    description: "Fix circulation after over-tight wrapping",
    category: "trauma" as const,
    colors: { bg: "bg-emerald-700", border: "border-emerald-700", accent: "text-emerald-200" } as ScenarioColors,
  },
] as const;

export type ScenarioKey = (typeof scenarioTypes)[number]["id"];

export const scenarios: Record<ScenarioKey, Scenario> = {
  hypovolemic: hypovolemicScenario,
  cardiogenic: cardiogenicScenario,
  septic: septicScenario,
  anaphylactic: anaphylacticScenario,
  neurogenic: neurogenicScenario,
  obstructive: obstructiveScenario,
  "power-tool-laceration": powerToolLacerationScenario,
  "arterial-thigh-bleed": arterialThighScenario,
  "venous-leg-glass": venousLegScenario,
  "capillary-knee-abrasion": capillaryKneeScenario,
  "bleeding-with-fracture": bleedingFractureScenario,
  "tight-bandage-hand": tightBandageScenario,
};
