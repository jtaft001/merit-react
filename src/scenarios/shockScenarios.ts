import type { ScenarioKey, Scenario } from "./shock/types";
import { hypovolemicScenario } from "./shock/hypovolemic";
import { cardiogenicScenario } from "./shock/cardiogenic";
import { septicScenario } from "./shock/septic";
import { anaphylacticScenario } from "./shock/anaphylactic";
import { neurogenicScenario } from "./shock/neurogenic";
import { obstructiveScenario } from "./shock/obstructive";

export const scenarioTypes: {
  id: ScenarioKey;
  name: string;
  description: string;
  color?: string;
}[] = [
  {
    id: "hypovolemic",
    name: "Hypovolemic Shock",
    description: "Bleeding trauma, control hemorrhage and call for help",
    color: "bg-red-600",
  },
  {
    id: "cardiogenic",
    name: "Cardiogenic Shock",
    description: "Heart problem, recognize and get ALS fast",
    color: "bg-rose-600",
  },
  {
    id: "septic",
    name: "Septic Shock",
    description: "Severe infection, early recognition saves lives",
    color: "bg-amber-600",
  },
  {
    id: "anaphylactic",
    name: "Anaphylactic Shock",
    description: "Severe allergy, assist with EpiPen if available",
    color: "bg-fuchsia-600",
  },
  {
    id: "neurogenic",
    name: "Neurogenic Shock",
    description: "Spinal injury, different from other shock types",
    color: "bg-blue-600",
  },
  {
    id: "obstructive",
    name: "Obstructive Shock",
    description: "Chest injury, recognize life threat early",
    color: "bg-indigo-600",
  },
];

export const scenarios: Record<ScenarioKey, Scenario> = {
  hypovolemic: hypovolemicScenario,
  cardiogenic: cardiogenicScenario,
  septic: septicScenario,
  anaphylactic: anaphylacticScenario,
  neurogenic: neurogenicScenario,
  obstructive: obstructiveScenario,
};
