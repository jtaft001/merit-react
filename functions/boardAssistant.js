const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const AnthropicSDK = require("@anthropic-ai/sdk");

const Anthropic = AnthropicSDK.default || AnthropicSDK;

// Set once with: npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-5-5";
const OWNER = "jtaft@pusdk12.org";
// Shared with the Status Board page (statusBoard is owner-only in the rules).
const MEMORY_DOC = ["statusBoard", "assistantMemory"];
const MAX_NOTES = 60;
const LOG_IN_PROMPT = 40;

// Same gate as isTeachingOwner() in firestore.rules.
function requireOwner(request) {
  const t = request.auth && request.auth.token;
  if (!t || !(t.teachingOwner === true || t.email === OWNER)) {
    throw new HttpsError("permission-denied", "Teaching HQ owner sign-in required.");
  }
}

async function loadMemory(db) {
  const snap = await db.collection(MEMORY_DOC[0]).doc(MEMORY_DOC[1]).get();
  const m = snap.exists ? snap.data() : {};
  return { notes: Array.isArray(m.notes) ? m.notes : [], log: Array.isArray(m.log) ? m.log : [] };
}

function memoryText(mem) {
  const notes = mem.notes.length
    ? mem.notes.map((n) => `- [${n.id}] ${n.text}`).join("\n")
    : "(none yet)";
  const log = mem.log.slice(-LOG_IN_PROMPT).map((l) =>
    `- ${l.date} ${l.period}: ${[l.dayLabel, l.title].filter(Boolean).join(" — ")}`).join("\n") || "(none yet)";
  return `<teacher_memory>\n${notes}\n</teacher_memory>\n\n<recent_board_log>\n${log}\n</recent_board_log>`;
}

const CONTEXT = `You work inside a high school CTE teacher's classroom Status Board: a projector page with one board per class period. Each day a period's board shows today's lesson (title, objectives, agenda with minutes, vocabulary, materials, homework), a BELL WORK box students answer on arrival, an EXIT TICKET box answered before leaving, a timer, and a work mode (SILENT / PARTNER / CREW / ALL CALL).

The teacher teaches Public Safety pathway courses (Law & Public Safety "ILPS"/"LPSCS", Intro to Patient Care, EMT, Wildfire Science) plus the NECI 9-1-1 Dispatch curriculum. Class periods drift off the published calendar — test days, re-teaching — so each period keeps its own place: either a day number in the Teaching HQ lesson sequence, or a queued multi-day unit it steps through one class day at a time.

Everything shown on the board is read by students on a projector: write it for students, short and concrete. Teacher-only material (scripts, answer keys, "explain to students that…", engagement tips) never goes on the board.`;

const PARSE_INSTRUCTIONS = `Turn the lesson or unit plan the teacher provides into class days for the board.

- Pack the plan's activities into days that fit the class length given, keeping about 10 minutes for bell work and the exit ticket. A test or quiz gets its own day. Keep the plan's order and its minute estimates; if the plan has no times, estimate sensible ones.
- Agenda: the student-facing activities for that day with minutes. Include "Bell work" first and "Exit ticket" last on normal days (5 minutes each); on a test day use "Quiet review" and "Finished: read silently" instead.
- Bell work and exit tickets: if the plan provides them for a day, use them. Otherwise write them: bell work should activate what the day builds on (an essential question, a quick scenario, recall of earlier vocabulary); the exit ticket should check that day's learning target. Follow any preferences in the teacher memory.
- Objectives: student-friendly "I can…" targets for that day.
- Vocabulary: only terms students need that day. Materials: only student-facing items (no answer keys or instructor-only files). Homework: only if the plan implies it, e.g. studying the night before a test.
- lessonTypes drive the board's work mode: Test/Quiz → silent; Group Work, Skills Lab, Scenario / Simulation, Project Work → crew talk; otherwise all-call.
- notes: one or two sentences to the teacher about anything you assumed (for example, how you split a 90-minute-block plan). Empty if nothing notable.`;

const CHAT_INSTRUCTIONS = `The teacher is talking to you from the board. Answer briefly (the reply shows in a small panel) and, when they ask for a change, make it with actions. Only act on what they asked; if the request is ambiguous, ask instead of guessing.

Actions (periodId is a board period id like "p2"):
- putUnitDayNow: show unit day \`number\` (1-based) of the period's queued unit on its board now; the unit then continues from the next day.
- setNextUnitDay: the period's queued unit resumes at day \`number\` at its next class.
- copyUnitTo: queue the unit from period \`text\` onto period \`periodId\`, starting at day \`number\` at its next class.
- testDayNow: put a test board up now on periodId; \`text\` is the test name. The period's place is unchanged.
- editToday: replace a section of the lesson currently on periodId's board. \`field\` is one of bellWork, exit, agenda, objectives, homework; \`text\` is the new student-facing content (agenda: one activity per line with "(N min)").
- setNextLessonDay: for a period on the Teaching HQ sequence, the next class loads lesson day \`number\`.
- pauseAuto / resumeAuto: stop or restart the period loading its next lesson automatically each school day.
Unused fields: number 0, field "", text "".

Memory: add a note only for durable facts or preferences that should shape future days ("P6 runs one day ahead of P2 on NECI", "prefers scenario bell work"). Keep each note to one sentence. Remove notes (by id) that the teacher says are wrong or outdated. Don't store one-off requests.`;

const str = { type: "string" };
const strList = { type: "array", items: str };
const LESSON_TYPES = ["Lecture / Media", "Group Work", "Skills Lab", "Scenario / Simulation", "Quiz", "Test", "Review", "Project Work"];

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "course", "notes", "days"],
  properties: {
    title: str,
    course: str,
    notes: str,
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "lessonTypes", "objectives", "agenda", "bellWork", "exitTicket", "vocab", "materials", "homework"],
        properties: {
          title: str,
          summary: str,
          lessonTypes: { type: "array", items: { type: "string", enum: LESSON_TYPES } },
          objectives: strList,
          agenda: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["activity", "minutes"],
              properties: { activity: str, minutes: { type: "integer" } },
            },
          },
          bellWork: str,
          exitTicket: str,
          vocab: strList,
          materials: strList,
          homework: str,
        },
      },
    },
  },
};

const ACTION_TYPES = ["putUnitDayNow", "setNextUnitDay", "copyUnitTo", "testDayNow", "editToday", "setNextLessonDay", "pauseAuto", "resumeAuto"];
const CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "memoryAdd", "memoryRemove", "actions"],
  properties: {
    reply: str,
    memoryAdd: strList,
    memoryRemove: strList,
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "periodId", "number", "field", "text"],
        properties: {
          type: { type: "string", enum: ACTION_TYPES },
          periodId: str,
          number: { type: "integer" },
          field: { type: "string", enum: ["", "bellWork", "exit", "agenda", "objectives", "homework"] },
          text: str,
        },
      },
    },
  },
};

// One structured-output call. Opus 5.5 always thinks; effort sets how hard.
async function callClaude({ system, content, schema, effort }) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    // The API's own message (e.g. "Your credit balance is too low…"), not the raw JSON body.
    const detail = (err && err.error && err.error.error && err.error.error.message) || (err && err.message) || "unknown error";
    if (err instanceof Anthropic.AuthenticationError) {
      throw new HttpsError("failed-precondition", "The Anthropic API key is missing or invalid.");
    } else if (err instanceof Anthropic.RateLimitError) {
      throw new HttpsError("resource-exhausted", "Claude is busy right now — try again in a minute.");
    } else if (err instanceof Anthropic.BadRequestError) {
      throw new HttpsError("invalid-argument", "Claude couldn't take that request: " + detail);
    } else if (err instanceof Anthropic.APIError) {
      throw new HttpsError("unavailable", `Claude error ${err.status}: ${detail}`);
    }
    throw new HttpsError("unavailable", "Couldn't reach Claude: " + detail);
  }
  if (response.stop_reason === "refusal") {
    throw new HttpsError("failed-precondition", "Claude declined this request.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpsError("resource-exhausted", "That plan is too long to split in one go — try a shorter section.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new HttpsError("internal", "Claude's answer wasn't readable — try again.");
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Status Board assistant (owner-only).
 *   action "parsePlan": { text? | pdfBase64?, fileName, classMinutes, period, course }
 *     → { title, course, notes, days[] } — class days in the board's lesson shape.
 *   action "chat": { message, today, active, periods[] }
 *     → { reply, actions[], memory } — memory edits are saved here; actions
 *       are applied by the board, which owns board state.
 */
const boardAssistant = async (request) => {
  requireOwner(request);
  const data = request.data || {};
  const db = admin.firestore();
  const mem = await loadMemory(db);
  const system = [
    { type: "text", text: CONTEXT },
    { type: "text", text: memoryText(mem) },
  ];

  if (data.action === "parsePlan") {
    const minutes = Math.max(20, Math.min(120, Number(data.classMinutes) || 55));
    const about = `Class length: ${minutes} minutes. Period: ${data.period || "unknown"}. Course: ${data.course || "unknown"}. File: ${data.fileName || "pasted text"}.`;
    const content = [];
    if (data.pdfBase64) {
      if (String(data.pdfBase64).length > 30 * 1024 * 1024) throw new HttpsError("invalid-argument", "That PDF is too large.");
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: data.pdfBase64 } });
    } else if (data.text && String(data.text).trim()) {
      content.push({ type: "text", text: `<plan>\n${String(data.text)}\n</plan>` });
    } else {
      throw new HttpsError("invalid-argument", "Send the plan as text or a PDF.");
    }
    content.push({ type: "text", text: `${about}\n\n${PARSE_INSTRUCTIONS}` });
    const plan = await callClaude({ system, content, schema: PLAN_SCHEMA, effort: "medium" });
    return plan;
  }

  if (data.action === "chat") {
    const message = String(data.message || "").trim();
    if (!message) throw new HttpsError("invalid-argument", "Say what you need.");
    const state = {
      today: data.today,
      activePeriod: data.active,
      periods: Array.isArray(data.periods) ? data.periods : [],
    };
    const content = [
      { type: "text", text: `<board_state>\n${JSON.stringify(state, null, 1)}\n</board_state>\n\n${CHAT_INSTRUCTIONS}` },
      { type: "text", text: message },
    ];
    const out = await callClaude({ system, content, schema: CHAT_SCHEMA, effort: "low" });

    // Apply memory edits here so the board can't forget to.
    const remove = new Set(out.memoryRemove || []);
    let notes = mem.notes.filter((n) => !remove.has(n.id));
    (out.memoryAdd || []).map((t) => String(t).trim()).filter(Boolean).forEach((t) => {
      notes.push({ id: newId(), text: t, at: new Date().toISOString() });
    });
    notes = notes.slice(-MAX_NOTES);
    if (remove.size || (out.memoryAdd || []).length) {
      await db.collection(MEMORY_DOC[0]).doc(MEMORY_DOC[1]).set({ notes }, { merge: true });
    }
    return { reply: out.reply, actions: out.actions || [], memory: notes };
  }

  throw new HttpsError("invalid-argument", "Unknown action.");
};

module.exports = { boardAssistant, ANTHROPIC_API_KEY };
