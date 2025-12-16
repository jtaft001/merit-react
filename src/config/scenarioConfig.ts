export const PASS_THRESHOLD = 60;

export const COLOR_MAP: Record<
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
  "power-tool-laceration": {
    bg: "bg-amber-700",
    border: "border-amber-700",
    accent: "text-amber-300",
  },
  "arterial-thigh-bleed": {
    bg: "bg-orange-700",
    border: "border-orange-700",
    accent: "text-orange-300",
  },
  "venous-leg-glass": {
    bg: "bg-yellow-700",
    border: "border-yellow-700",
    accent: "text-yellow-200",
  },
  "capillary-knee-abrasion": {
    bg: "bg-lime-700",
    border: "border-lime-700",
    accent: "text-lime-200",
  },
  "bleeding-with-fracture": {
    bg: "bg-teal-700",
    border: "border-teal-700",
    accent: "text-teal-200",
  },
  "tight-bandage-hand": {
    bg: "bg-emerald-700",
    border: "border-emerald-700",
    accent: "text-emerald-200",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  shock: "Shock scenarios",
  trauma: "Trauma / bleeding scenarios",
};
