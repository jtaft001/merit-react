// The fixed set of courses offered. Classes pick one of these (no free text) so
// that areas of the app can later be shown to students by course.
//
// To add/rename a course, edit this list — everything else (the class form, the
// derived class name, future class-specific content) reads from here.

export type CourseTypeId = "law-public-safety" | "patient-care" | "emt";

export type CourseType = {
  id: CourseTypeId;
  label: string;
};

export const COURSE_TYPES: CourseType[] = [
  { id: "law-public-safety", label: "Intro to Law and Public Safety" },
  { id: "patient-care", label: "Intro to Patient Care" },
  { id: "emt", label: "EMT" },
];

export function courseLabel(id?: string): string {
  return COURSE_TYPES.find((c) => c.id === id)?.label ?? "";
}

// School periods 1–6.
export const SCHOOL_PERIODS = [1, 2, 3, 4, 5, 6] as const;
