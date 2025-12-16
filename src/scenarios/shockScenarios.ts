import type { ScenarioKey, Scenario } from "./shock/types";
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

export const scenarioTypes: {
  id: ScenarioKey;
  name: string;
  description: string;
  color?: string;
  category: "shock" | "trauma";
}[] = [
  {
    id: "hypovolemic",
    name: "Hypovolemic Shock",
    description: "Bleeding trauma, control hemorrhage and call for help",
    color: "bg-red-600",
    category: "shock",
  },
  {
    id: "cardiogenic",
    name: "Cardiogenic Shock",
    description: "Heart problem, recognize and get ALS fast",
    color: "bg-rose-600",
    category: "shock",
  },
  {
    id: "septic",
    name: "Septic Shock",
    description: "Severe infection, early recognition saves lives",
    color: "bg-amber-600",
    category: "shock",
  },
  {
    id: "anaphylactic",
    name: "Anaphylactic Shock",
    description: "Severe allergy, assist with EpiPen if available",
    color: "bg-fuchsia-600",
    category: "shock",
  },
  {
    id: "neurogenic",
    name: "Neurogenic Shock",
    description: "Spinal injury, different from other shock types",
    color: "bg-blue-600",
    category: "shock",
  },
  {
    id: "obstructive",
    name: "Obstructive Shock",
    description: "Chest injury, recognize life threat early",
    color: "bg-indigo-600",
    category: "shock",
  },
  {
    id: "power-tool-laceration",
    name: "Power Tool Laceration",
    description: "Escalate bleeding control when direct pressure fails",
    color: "bg-amber-700",
    category: "trauma",
  },
  {
    id: "arterial-thigh-bleed",
    name: "Arterial Thigh Bleed",
    description: "Spurting arterial hemorrhage needs immediate tourniquet",
    color: "bg-orange-700",
    category: "trauma",
  },
  {
    id: "venous-leg-glass",
    name: "Venous Leg Laceration",
    description: "Control steady venous bleeding with pressure bandage",
    color: "bg-yellow-700",
    category: "trauma",
  },
  {
    id: "capillary-knee-abrasion",
    name: "Capillary Knee Abrasion",
    description: "Minor oozing with contamination risk",
    color: "bg-lime-700",
    category: "trauma",
  },
  {
    id: "bleeding-with-fracture",
    name: "Bleeding with Fracture",
    description: "Control bleeding without worsening a deformity",
    color: "bg-teal-700",
    category: "trauma",
  },
  {
    id: "tight-bandage-hand",
    name: "Bandage Too Tight",
    description: "Fix circulation after over-tight wrapping",
    color: "bg-emerald-700",
    category: "trauma",
  },
];

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
