// Declarative schema for the private Teaching HQ.
//
// One Firestore collection ("teaching") holds every record; a `type` field says
// which database (courses, lessonDays, …) it belongs to. This file is the single
// source of truth for the databases, their fields, and their select options —
// the generic CollectionPage and the Daily Dashboard both read from here.
//
// Ported from the Notion "Teaching HQ — 2026–27" workspace.

/** Only this account may see or edit anything under Teaching HQ. */
export const OWNER_EMAIL = "jtaft@pusdk12.org";

/** The single Firestore collection all Teaching HQ records live in. */
export const TEACHING_COLLECTION = "teaching";

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "money"
  | "url"
  | "date"
  | "checkbox"
  | "select"
  | "multiselect"
  | "relation";

/** Notion-style option colors, mapped to Tailwind badge classes below. */
export type OptionColor =
  | "blue"
  | "red"
  | "green"
  | "orange"
  | "yellow"
  | "purple"
  | "pink"
  | "gray"
  | "brown"
  | "default";

export type SelectOption = { value: string; color?: OptionColor };

export type Field = {
  /** camelCase Firestore key. */
  key: string;
  /** Display label (also the Notion property name unless `notion` overrides). */
  label: string;
  /** Notion property name, when it differs from `label` (used by the importer). */
  notion?: string;
  type: FieldType;
  options?: SelectOption[];
  /** For relation fields: the collection id this points at. */
  relationTo?: string;
  /** Show this field as a column in the list view. */
  inList?: boolean;
  help?: string;
};

export type CollectionDef = {
  /** Stable id: used as the `type` value, the route segment, and import key. */
  id: string;
  label: string;
  icon: string;
  blurb: string;
  /** Field key that holds the record's title. */
  titleField: string;
  fields: Field[];
};

// Reusable option sets ------------------------------------------------------

const opt = (value: string, color?: OptionColor): SelectOption => ({ value, color });

// Databases — rebuilt one at a time. Reusable option sets (e.g. a STATUS list)
// get re-added here as the databases that need them come back.

// -------------------------------------------------------------------------

export const COLLECTIONS: CollectionDef[] = [
  {
    id: "courses",
    label: "Courses",
    icon: "📚",
    blurb: "The classes you teach. Everything else relates back here.",
    titleField: "course",
    fields: [
      { key: "course", label: "Course", type: "text", inList: true },
      {
        key: "code",
        label: "Code",
        type: "select",
        inList: true,
        options: [opt("LPSCS", "blue"), opt("EMT", "red"), opt("IPC", "green"), opt("WILD", "orange")],
      },
      {
        key: "period",
        label: "Period",
        type: "select",
        inList: true,
        options: [opt("Period 2", "blue"), opt("Period 3", "red"), opt("TBD", "gray")],
      },
      { key: "currentUnit", label: "Current Unit / Phase", type: "text", inList: true },
      {
        key: "platform",
        label: "Platform",
        type: "multiselect",
        options: [
          opt("iCEV", "blue"),
          opt("Navigate (Jones & Bartlett)", "red"),
          opt("NHA", "green"),
          opt("Google Classroom", "yellow"),
          opt("Canvas", "purple"),
        ],
      },
      { key: "regularDayTime", label: "Regular Day Time", type: "text", help: "Bell schedule Mon/Tue/Thu/Fri" },
      { key: "wednesdayTime", label: "Wednesday Time", type: "text", help: "Late start / PLC Wednesday" },
      { key: "minutesRegular", label: "Minutes Regular", type: "number" },
      { key: "minutesWednesday", label: "Minutes Wednesday", type: "number" },
      { key: "totalDays", label: "Total Days", type: "number" },
      { key: "sourceDocument", label: "Source Document", type: "text" },
      { key: "notes", label: "Notes", type: "longtext" },
    ],
  },
];

export function getCollection(id: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/** Tailwind badge classes for each Notion option color (light theme). */
export const COLOR_CLASSES: Record<OptionColor, string> = {
  blue: "bg-blue-100 text-blue-700",
  red: "bg-rose-100 text-rose-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
  yellow: "bg-amber-100 text-amber-800",
  purple: "bg-purple-100 text-purple-700",
  pink: "bg-pink-100 text-pink-700",
  gray: "bg-slate-100 text-slate-600",
  brown: "bg-yellow-900/10 text-yellow-900",
  default: "bg-slate-100 text-slate-600",
};

export function optionColor(field: Field, value: string): OptionColor {
  return field.options?.find((o) => o.value === value)?.color ?? "default";
}
