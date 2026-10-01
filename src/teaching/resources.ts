/**
 * Lesson links stored in a `resources` text field: one "[Label](https://…)"
 * per line (a bare URL works too). A label starting with 🔑 marks a
 * teacher-only link (answer keys, tests) that must not reach the projector.
 */
export type ResourceLink = { label: string; url: string; teacherOnly: boolean };

const KEY = "🔑";

export function parseResources(text: unknown): ResourceLink[] {
  if (typeof text !== "string") return [];
  const out: ResourceLink[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const md = line.match(/^\[([^\]]*)\]\(\s*(\S+?)\s*\)$/);
    const url = md ? md[2] : line;
    // Only real web links — never javascript:, data:, etc.
    if (!/^https?:\/\//i.test(url)) continue;
    let label = (md ? md[1] : url).trim();
    const teacherOnly = label.startsWith(KEY);
    if (teacherOnly) label = label.slice(KEY.length).trim();
    out.push({ label: label || url, url, teacherOnly });
  }
  return out;
}
