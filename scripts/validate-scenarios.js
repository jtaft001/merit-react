#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

const filePath = path.resolve(process.cwd(), "src/scenarios/shockScenarios.ts");

function findMatchingBrace(str, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function collectTopLevelObjects(text) {
  // Use a regex to find keys followed by an object brace and then use a brace-matcher
  // to extract the full object body. This is more robust for identifiers with
  // underscores and varied spacing.
  const map = new Map();
  const keyRegex = /([A-Za-z0-9_$\_]+)\s*:\s*\{/g;
  let match;
  while ((match = keyRegex.exec(text)) !== null) {
    const key = match[1];
    const braceStart = match.index + match[0].lastIndexOf('{');
    const end = findMatchingBrace(text, braceStart);
    if (end === -1) break;
    const body = text.slice(braceStart, end + 1);
    map.set(key, body);
    // move regex lastIndex forward so we don't re-match inside the object
    keyRegex.lastIndex = end + 1;
  }
  return map;
}

function extractNextsFromOptions(optionsText) {
  const nexts = [];
  const regex = /next\s*:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = regex.exec(optionsText)) !== null) {
    nexts.push(m[1]);
  }
  return nexts;
}

async function run() {
  try {
    const content = await fs.readFile(filePath, "utf8");

    const marker = "export const scenarios";
    const idx = content.indexOf(marker);
    if (idx === -1) {
      console.error("Could not find 'export const scenarios' in file:", filePath);
      process.exit(2);
    }
    const eqIdx = content.indexOf("=", idx);
    const objStart = content.indexOf("{", eqIdx);
    const objEnd = findMatchingBrace(content, objStart);
    if (objStart === -1 || objEnd === -1) {
      console.error("Could not locate scenarios object braces");
      process.exit(2);
    }
    const scenariosText = content.slice(objStart, objEnd + 1);
    const scenariosMap = collectTopLevelObjects(scenariosText.slice(1, -1));

    function sceneBodyTrimmed(s) {
      if (!s) return s;
      if (s[0] === '{' && s[s.length - 1] === '}') return s.slice(1, -1);
      return s;
    }

    const errors = [];
    const warnings = [];

    for (const [scenarioKey, scenarioBody] of scenariosMap.entries()) {
      // parse scenes inside scenarioBody
      const scenes = collectTopLevelObjects(sceneBodyTrimmed(scenarioBody));
      if (scenarioKey === 'septic') {
        console.log('DEBUG: septic scene keys =', Array.from(scenes.keys()));
        // print surrounding bytes for the movement key area to debug parsing
        const s = sceneBodyTrimmed(scenarioBody);
        const idx1 = s.indexOf("movement_error");
        const idx2 = s.indexOf("'movement_error'");
        const pos = idx2 !== -1 ? idx2 : idx1;
        if (pos !== -1) {
          const start = Math.max(0, pos - 20);
          const snippet = s.slice(start, pos + 40);
          console.log('DEBUG: snippet chars:', snippet.split('').map(c => `${c.charCodeAt(0)}(${c})`).join(' '));
        }
      }
      const sceneKeys = new Set(scenes.keys());

      for (const [sceneKey, sceneBody] of scenes.entries()) {
        // find options array inside sceneBody text
        const optMatch = sceneBody.match(/options\s*:\s*\[([\s\S]*?)\]\s*(,|$)/);
        if (!optMatch) continue;
        const optionsText = optMatch[1];
        const nexts = extractNextsFromOptions(optionsText);
        for (const nxt of nexts) {
          if (!sceneKeys.has(nxt)) {
            errors.push(`In scenario '${scenarioKey}': scene '${sceneKey}' has option.next='${nxt}' which does not match any scene key.`);
          }
        }

        // check bp field within this scene
        const bpMatch = sceneBody.match(/bp\s*:\s*([^,\n}]+)/);
        if (bpMatch) {
          const bpRaw = bpMatch[1].trim();
          if (/^["']\d+\/\d+["']$/.test(bpRaw)) {
            warnings.push(`In scenario '${scenarioKey}', scene '${sceneKey}': bp is a string (${bpRaw}). Consider using structured { systolic, diastolic }.`);
          }
        }
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log("scenarios validation: OK — no issues found.");
      process.exit(0);
    }

    if (warnings.length > 0) {
      console.log("scenarios validation: Warnings:");
      for (const w of warnings) console.log("  -", w);
    }
    if (errors.length > 0) {
      console.error("scenarios validation: Errors:");
      for (const e of errors) console.error("  -", e);
      process.exit(2);
    }
  } catch (err) {
    console.error("Validator failed:", err);
    process.exit(2);
  }
}

run();
