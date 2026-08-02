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

const STATUS: SelectOption[] = [
  { value: "Not started", color: "gray" },
  { value: "In progress", color: "blue" },
  { value: "Done", color: "green" },
];

const opt = (value: string, color?: OptionColor): SelectOption => ({ value, color });

// The nine databases -------------------------------------------------------

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
  {
    id: "lessonDays",
    label: "Lesson Days",
    icon: "📅",
    blurb: "One row per class meeting. Topic, activity, homework, prep status.",
    titleField: "lesson",
    fields: [
      { key: "lesson", label: "Lesson", type: "text", inList: true },
      { key: "date", label: "Date", type: "date", inList: true },
      { key: "dayNumber", label: "Day #", type: "number" },
      { key: "course", label: "Course", type: "relation", relationTo: "courses", inList: true },
      {
        key: "lessonType",
        label: "Lesson Type",
        type: "multiselect",
        inList: true,
        options: [
          opt("Lecture / Media", "blue"),
          opt("Skills Lab", "green"),
          opt("Scenario / Simulation", "orange"),
          opt("Quiz", "yellow"),
          opt("Unit Exam", "red"),
          opt("Check-off", "purple"),
          opt("Project Work", "pink"),
          opt("Review", "brown"),
          opt("Guest / Field", "gray"),
        ],
      },
      { key: "unitPhase", label: "Unit / Phase", type: "text" },
      { key: "lessonBlock", label: "Lesson Block", type: "text" },
      { key: "classActivity", label: "Class Activity", type: "longtext" },
      { key: "chaptersMedia", label: "Chapters / Media", type: "text" },
      { key: "preClassHomework", label: "Pre-Class Homework", type: "longtext" },
      { key: "prepStatus", label: "Prep Status", type: "select", inList: true, options: STATUS },
      {
        key: "scheduleType",
        label: "Schedule Type",
        type: "select",
        options: [
          opt("Regular Day", "blue"),
          opt("Wednesday PLC / Late Start", "purple"),
          opt("Minimum Day", "yellow"),
          opt("Final Exam Block", "red"),
        ],
      },
      { key: "duration", label: "Duration (min)", type: "number" },
      { key: "copiesNeeded", label: "Copies Needed", type: "checkbox" },
      { key: "labSetupNeeded", label: "Lab Setup Needed", type: "checkbox" },
      { key: "reflection", label: "Reflection / What Actually Happened", type: "longtext" },
      { key: "lessonPlan", label: "Lesson Plan", type: "relation", relationTo: "lessonPlans" },
      { key: "materials", label: "Materials", type: "relation", relationTo: "materials" },
      { key: "assessments", label: "Assessments", type: "relation", relationTo: "deadlines" },
    ],
  },
  {
    id: "lessonPlans",
    label: "Lesson Plans",
    icon: "📝",
    blurb: "The reusable plan behind a lesson — objectives, flow, materials.",
    titleField: "lessonPlan",
    fields: [
      { key: "lessonPlan", label: "Lesson Plan", type: "text", inList: true },
      { key: "course", label: "Course", type: "relation", relationTo: "courses", inList: true },
      { key: "unit", label: "Unit", type: "text", inList: true },
      {
        key: "planType",
        label: "Plan Type",
        type: "select",
        inList: true,
        options: [
          opt("Navigate Lesson", "blue"),
          opt("AHA Course (external curriculum)", "yellow"),
          opt("Skills Lab / Check-off", "green"),
          opt("Exam & Review", "red"),
          opt("Orientation / Admin", "gray"),
          opt("NREMT & Clinical Prep", "purple"),
          opt("iCEV Lesson", "orange"),
          opt("iCEV Career Pathway Overview", "brown"),
        ],
      },
      { key: "planStatus", label: "Plan Status", type: "select", inList: true, options: STATUS },
      { key: "chapters", label: "Chapters", type: "text" },
      { key: "objectives", label: "Objectives", type: "longtext" },
      { key: "inClassFlow", label: "In-Class Flow", type: "longtext", help: "Activity sequence from the publisher plan" },
      { key: "materialsNeeded", label: "Materials Needed", type: "longtext" },
      { key: "daysCovered", label: "Days Covered", type: "number" },
      { key: "planInClassTime", label: "Plan In-Class Time (min)", type: "number" },
      { key: "preClassLoad", label: "Pre-Class Load (min)", type: "number" },
      { key: "driveLink", label: "Drive Link", type: "url" },
      { key: "revisedFor2627", label: "Revised for 2026-27", type: "checkbox" },
      { key: "runs", label: "Runs", type: "date" },
      { key: "notes", label: "Notes", type: "longtext" },
      { key: "lessonDays", label: "Lesson Days", type: "relation", relationTo: "lessonDays" },
    ],
  },
  {
    id: "deadlines",
    label: "Deadlines & Assessments",
    icon: "🎯",
    blurb: "Exams, check-offs, projects, cert deadlines, grade-submission dates.",
    titleField: "assessment",
    fields: [
      { key: "assessment", label: "Assessment", type: "text", inList: true },
      {
        key: "assessmentType",
        label: "Type",
        type: "select",
        inList: true,
        options: [
          opt("Unit Exam", "red"),
          opt("Final Exam", "red"),
          opt("Quiz", "yellow"),
          opt("Skills Check-off", "purple"),
          opt("Project / Deliverable", "pink"),
          opt("Capstone", "orange"),
          opt("Certification", "blue"),
          opt("Grades Due", "brown"),
          opt("Paperwork / Admin", "gray"),
        ],
      },
      { key: "course", label: "Course", type: "relation", relationTo: "courses", inList: true },
      { key: "dueDate", label: "Due Date", type: "date", inList: true },
      { key: "status", label: "Status", type: "select", inList: true, options: STATUS },
      {
        key: "gradingStatus",
        label: "Grading Status",
        type: "select",
        options: [
          opt("Not collected", "gray"),
          opt("Collected — ungraded", "yellow"),
          opt("Grading in progress", "blue"),
          opt("Graded", "green"),
          opt("Returned to students", "purple"),
        ],
      },
      {
        key: "owner",
        label: "Owner",
        type: "select",
        options: [opt("Students", "blue"), opt("Me", "orange"), opt("Both", "purple")],
      },
      { key: "weightPoints", label: "Weight / Points", type: "number" },
      { key: "unitPhase", label: "Unit / Phase", type: "text" },
      {
        key: "prepLeadTime",
        label: "Prep Lead Time",
        type: "select",
        options: [opt("Same week", "green"), opt("1 week ahead", "yellow"), opt("2+ weeks ahead", "red")],
      },
      { key: "details", label: "Details", type: "longtext" },
      { key: "lessonDay", label: "Lesson Day", type: "relation", relationTo: "lessonDays" },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "✅",
    blurb: "Anything you have to do. Grading, prep, calls, paperwork.",
    titleField: "task",
    fields: [
      { key: "task", label: "Task", type: "text", inList: true },
      { key: "status", label: "Status", type: "select", inList: true, options: STATUS },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        inList: true,
        options: [opt("Urgent", "red"), opt("High", "orange"), opt("Normal", "blue"), opt("Someday", "gray")],
      },
      {
        key: "category",
        label: "Category",
        type: "select",
        inList: true,
        options: [
          opt("Grading", "purple"),
          opt("Lesson Prep", "blue"),
          opt("Copies / Printing", "yellow"),
          opt("Lab Setup", "green"),
          opt("Email / Comms", "pink"),
          opt("Admin & Paperwork", "gray"),
          opt("Ordering / Supplies", "orange"),
          opt("Clinical / Partners", "red"),
          opt("PD & Meetings", "brown"),
        ],
      },
      { key: "course", label: "Course", type: "relation", relationTo: "courses" },
      { key: "doDate", label: "Do Date", type: "date" },
      { key: "dueDate", label: "Due Date", type: "date", inList: true },
      { key: "estMinutes", label: "Est. Minutes", type: "number" },
      {
        key: "recurring",
        label: "Recurring",
        type: "select",
        options: [
          opt("One-off", "gray"),
          opt("Daily", "blue"),
          opt("Weekly", "green"),
          opt("Per Unit", "orange"),
          opt("Per Trimester", "red"),
        ],
      },
      { key: "blockedBy", label: "Blocked By", type: "text" },
      { key: "notes", label: "Notes", type: "longtext" },
    ],
  },
  {
    id: "materials",
    label: "Materials & Lab Prep",
    icon: "🧰",
    blurb: "Consumables and equipment, tied to the lesson that needs them.",
    titleField: "item",
    fields: [
      { key: "item", label: "Item", type: "text", inList: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        inList: true,
        options: [
          opt("Manikin / Trainer", "red"),
          opt("Consumable", "orange"),
          opt("PPE", "yellow"),
          opt("Craft / Classroom Supply", "green"),
          opt("Print / Handout", "blue"),
          opt("Media / Tech", "purple"),
          opt("Borrowed from Partner", "pink"),
        ],
      },
      { key: "status", label: "Status", type: "select", inList: true, options: STATUS },
      { key: "course", label: "Course", type: "relation", relationTo: "courses" },
      { key: "forLesson", label: "For Lesson", type: "relation", relationTo: "lessonDays" },
      { key: "neededBy", label: "Needed By", type: "date", inList: true },
      { key: "qtyNeeded", label: "Qty Needed", type: "number", inList: true },
      { key: "qtyOnHand", label: "Qty On Hand", type: "number", inList: true },
      { key: "estCost", label: "Est. Cost", type: "money" },
      { key: "sourceVendor", label: "Source / Vendor", type: "text" },
      { key: "reusable", label: "Reusable", type: "checkbox" },
      { key: "notes", label: "Notes", type: "longtext" },
    ],
  },
  {
    id: "certifications",
    label: "Certifications & Compliance",
    icon: "🎖️",
    blurb: "Student-facing cert tracking: CPR, TB tests, FEMA, clinical hours, NREMT.",
    titleField: "requirement",
    fields: [
      { key: "requirement", label: "Requirement", type: "text", inList: true },
      {
        key: "credential",
        label: "Credential",
        type: "select",
        inList: true,
        options: [
          opt("AHA BLS / CPR", "red"),
          opt("FEMA IS-100.c", "blue"),
          opt("FEMA IS-700.b", "blue"),
          opt("FEMA CERT", "orange"),
          opt("TB Test / Health Clearance", "green"),
          opt("Clinical Ride-Along Hours", "purple"),
          opt("NREMT Cognitive", "pink"),
          opt("NREMT Psychomotor", "pink"),
          opt("NHA PCT Prep", "yellow"),
          opt("Other", "gray"),
        ],
      },
      { key: "course", label: "Course", type: "relation", relationTo: "courses", inList: true },
      { key: "status", label: "Status", type: "select", inList: true, options: STATUS },
      { key: "targetDate", label: "Target Date", type: "date", inList: true },
      { key: "studentsComplete", label: "Students Complete", type: "number" },
      { key: "studentsTotal", label: "Students Total", type: "number" },
      {
        key: "verificationMethod",
        label: "Verification Method",
        type: "select",
        options: [
          opt("Instructor sign-off", "blue"),
          opt("Uploaded certificate", "green"),
          opt("External proctor", "red"),
          opt("Site preceptor signature", "orange"),
          opt("District records", "gray"),
        ],
      },
      { key: "blocksWhat", label: "Blocks What", type: "text", help: "What the student cannot do until this clears" },
      { key: "notes", label: "Notes", type: "longtext" },
    ],
  },
  {
    id: "emails",
    label: "Email Tracker",
    icon: "✉️",
    blurb: "Emails that need a reply or created a task.",
    titleField: "subject",
    fields: [
      { key: "subject", label: "Subject", type: "text", inList: true },
      { key: "status", label: "Status", type: "select", inList: true, options: STATUS },
      {
        key: "actionNeeded",
        label: "Action Needed",
        type: "select",
        inList: true,
        options: [
          opt("Reply", "orange"),
          opt("FYI — no action", "gray"),
          opt("Send document", "green"),
          opt("Schedule something", "blue"),
          opt("Escalate to admin", "red"),
          opt("Waiting on them", "yellow"),
        ],
      },
      {
        key: "senderType",
        label: "Sender Type",
        type: "select",
        options: [
          opt("Parent / Guardian", "pink"),
          opt("Student", "blue"),
          opt("Admin / District", "red"),
          opt("Colleague / PLC", "green"),
          opt("Clinical Site / Preceptor", "orange"),
          opt("Vendor / Publisher", "yellow"),
          opt("Counselor / SpEd", "purple"),
          opt("Other", "gray"),
        ],
      },
      { key: "fromTo", label: "From / To", type: "text", inList: true },
      { key: "summaryAsk", label: "Summary / Ask", type: "longtext" },
      { key: "course", label: "Course", type: "relation", relationTo: "courses" },
      { key: "received", label: "Received", type: "date" },
      { key: "replyBy", label: "Reply By", type: "date", inList: true },
      { key: "lastMessage", label: "Last Message", type: "date" },
      { key: "followUpCount", label: "Follow-up Count", type: "number" },
      { key: "emailLink", label: "Email Link", type: "url" },
      { key: "threadId", label: "Thread ID", type: "text", help: "Gmail thread ID — the unique key. Never edit." },
      { key: "keepForRecord", label: "Keep for Record", type: "checkbox" },
      { key: "reopened", label: "Reopened", type: "checkbox" },
    ],
  },
  {
    id: "districtCalendar",
    label: "District Calendar",
    icon: "🗓️",
    blurb: "PUSD holidays, trimester ends, finals, minimum days.",
    titleField: "event",
    fields: [
      { key: "event", label: "Event", type: "text", inList: true },
      {
        key: "eventType",
        label: "Type",
        type: "select",
        inList: true,
        options: [
          opt("Holiday / No School", "red"),
          opt("Break", "orange"),
          opt("Semester / Trimester Boundary", "purple"),
          opt("Final Exams", "pink"),
          opt("Grades Due", "brown"),
          opt("Minimum Day", "yellow"),
          opt("Teacher Work / PD Day", "blue"),
          opt("Parent Conference", "green"),
          opt("Contingency Make-Up Day", "gray"),
          opt("First / Last Day", "default"),
        ],
      },
      { key: "date", label: "Date", type: "date", inList: true },
      {
        key: "affectsPacingFor",
        label: "Affects Pacing For",
        type: "multiselect",
        inList: true,
        options: [opt("LPSCS", "blue"), opt("EMT", "red"), opt("IPC", "green"), opt("All", "gray")],
      },
      { key: "studentsPresent", label: "Students Present", type: "checkbox" },
      { key: "instructionalImpact", label: "Instructional Impact", type: "longtext" },
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
