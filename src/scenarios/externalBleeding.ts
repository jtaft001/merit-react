import type { Scenario } from "./shock/types";

export const powerToolLacerationScenario: Scenario = {
  initial: {
    title: "Garage Injury",
    text:
      "You respond to a garage for a 37-year-old female who cut her forearm with a circular saw. She is seated, alert, and holding a towel over her arm. Blood is soaking through the towel and dripping onto the floor.",
    vitals: {
      hr: 112,
      bp: { systolic: 110, diastolic: 72 },
      rr: 20,
      spo2: 98,
      skin: "Pale, anxious",
    },
    options: [
      {
        text: "Apply fresh sterile gauze, firm direct pressure, prepare a pressure bandage",
        next: "pressure_bandage",
        points: 10,
      },
      {
        text: "Keep the same towel and wait for the ambulance",
        next: "bleeding_continues",
        points: -5,
        isWrong: true,
        feedback:
          "Soaked material cannot generate enough pressure. Replace with clean gauze and apply firm, focused pressure to slow the bleed.",
      },
      {
        text: "Immediately place a tourniquet high and tight",
        next: "tourniquet_applied",
        points: 2,
        feedback:
          "A tourniquet is appropriate if bleeding stays uncontrolled after good pressure. Use it when pressure/pressure bandage fail or bleeding is clearly life-threatening.",
      },
      {
        text: "Elevate her arm above her heart before achieving control",
        next: "bleeding_continues",
        points: -2,
        isWrong: true,
        feedback:
          "Elevation alone will not control a heavy bleed. Focus on firm pressure and a snug pressure bandage first.",
      },
    ],
  },
  pressure_bandage: {
    title: "Pressure Bandage",
    text:
      "You replace the towel with stacked gauze, maintain firm pressure, and wrap a pressure bandage. Bleeding slows but still oozes.",
    vitals: {
      hr: 108,
      bp: { systolic: 112, diastolic: 74 },
      rr: 18,
      spo2: 99,
      skin: "Pale, calmer",
    },
    options: [
      {
        text: "Keep firm pressure for 2 minutes, add more gauze if needed, reassess",
        next: "controlled",
        points: 10,
      },
      {
        text: "Loosen the wrap repeatedly to peek at the wound",
        next: "bleeding_continues",
        points: -3,
        isWrong: true,
        feedback:
          "Frequent loosening breaks the clot. Leave steady pressure in place and only reassess after sustained compression.",
      },
    ],
  },
  bleeding_continues: {
    title: "Bleeding Not Controlled",
    text:
      "Blood keeps soaking through despite your efforts. The patient says she feels lightheaded.",
    vitals: {
      hr: 124,
      bp: { systolic: 104, diastolic: 68 },
      rr: 22,
      spo2: 97,
      skin: "Pale, cool",
    },
    options: [
      {
        text: "Apply a tourniquet 2-3 inches above the wound, tighten until bleeding stops, note the time",
        next: "tourniquet_applied",
        points: 8,
      },
      {
        text: "Keep rechecking without changing anything",
        next: "deteriorating",
        points: -5,
        isWrong: true,
        feedback:
          "Uncontrolled bleeding is life-threatening. Escalate—tourniquet is indicated when direct pressure and a pressure bandage fail.",
      },
    ],
  },
  tourniquet_applied: {
    title: "Tourniquet Use",
    text:
      "You place a commercial tourniquet above the wound and tighten until bleeding stops. You note the time and keep her arm at rest.",
    vitals: {
      hr: 102,
      bp: { systolic: 116, diastolic: 76 },
      rr: 18,
      spo2: 99,
      skin: "Pale, improving",
    },
    options: [
      {
        text: "Monitor for shock, cover to keep warm, continue ABCs until transport",
        next: "success",
        points: 8,
      },
    ],
  },
  deteriorating: {
    title: "Patient Worsening",
    text:
      "She becomes more lightheaded and anxious. Bleeding continues to pool despite your efforts.",
    vitals: {
      hr: 132,
      bp: { systolic: 98, diastolic: 62 },
      rr: 24,
      spo2: 97,
      skin: "Very pale, cool",
    },
    options: [
      {
        text: "Call for ALS, apply a tourniquet now, lay her flat, keep warm",
        next: "tourniquet_applied",
        points: 5,
      },
    ],
  },
  controlled: {
    title: "Bleeding Controlled",
    text:
      "Your pressure bandage stays snug and bleeding has stopped. The patient feels less anxious. You monitor and prepare for transport.",
    vitals: {
      hr: 100,
      bp: { systolic: 118, diastolic: 78 },
      rr: 18,
      spo2: 99,
      skin: "Warm, pinking up",
    },
    options: [
      {
        text: "Continue monitoring, check distal pulse/movement/sensation, keep her warm",
        next: "success",
        points: 8,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You escalated from direct pressure to a proper pressure bandage, and used a tourniquet only when needed. Bleeding is controlled and the patient remains stable for transport. Key EMR skills: BSI, firm direct pressure, snug pressure bandage, timely tourniquet, monitoring for shock.",
    vitals: {
      hr: 96,
      bp: { systolic: 120, diastolic: 80 },
      rr: 16,
      spo2: 100,
      skin: "Improving",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};

export const arterialThighScenario: Scenario = {
  initial: {
    title: "Construction Site",
    text:
      "At a construction site, a 29-year-old male has a deep thigh laceration from sheet metal. Bright red blood spurts with each heartbeat. A loose towel is barely in place.",
    vitals: {
      hr: 138,
      bp: { systolic: 88, diastolic: 52 },
      rr: 28,
      spo2: 96,
      skin: "Pale, sweaty",
    },
    options: [
      {
        text: "Apply a tourniquet high and tight above the wound immediately, tighten until bleeding stops",
        next: "tourniquet_done",
        points: 20,
      },
      {
        text: "Try only direct pressure with the same towel",
        next: "pressure_attempt",
        points: -5,
        isWrong: true,
        feedback:
          "Spurting arterial bleeding needs fast, decisive control. Go straight to a tourniquet while applying pressure.",
      },
      {
        text: "Elevate the leg and wait",
        next: "pressure_attempt",
        points: -5,
        isWrong: true,
        feedback:
          "Elevation will not stop arterial bleeding. You need a tourniquet right away.",
      },
    ],
  },
  pressure_attempt: {
    title: "Pressure Alone Fails",
    text:
      "You try to hold pressure but blood continues to spurt around the towel. The patient is becoming dizzy.",
    vitals: {
      hr: 146,
      bp: { systolic: 82, diastolic: 48 },
      rr: 30,
      spo2: 95,
      skin: "Very pale",
    },
    options: [
      {
        text: "Switch to a tourniquet now, 2-3 inches above the wound",
        next: "tourniquet_done",
        points: 12,
      },
      {
        text: "Keep pressing and hope it slows",
        next: "deteriorate",
        points: -8,
        isWrong: true,
        feedback:
          "Delays cost blood volume. Arterial bleeding demands a tourniquet immediately.",
      },
    ],
  },
  tourniquet_done: {
    title: "Tourniquet Applied",
    text:
      "You place a commercial tourniquet high and tight, crank until bleeding stops, and note the time. Bleeding is controlled.",
    vitals: {
      hr: 122,
      bp: { systolic: 100, diastolic: 60 },
      rr: 22,
      spo2: 98,
      skin: "Pale, improving",
    },
    options: [
      {
        text: "Lay him flat, apply oxygen, keep warm, call ALS for rapid transport",
        next: "success",
        points: 10,
      },
    ],
  },
  deteriorate: {
    title: "Blood Loss Continues",
    text:
      "The patient becomes more confused. Spurting continues. You are losing valuable time.",
    vitals: {
      hr: 154,
      bp: { systolic: 78, diastolic: 46 },
      rr: 32,
      spo2: 94,
      skin: "Gray, clammy",
    },
    options: [
      {
        text: "Apply a tourniquet immediately and prepare for rapid transport",
        next: "tourniquet_done",
        points: 6,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You recognized arterial bleeding and controlled it fast with a tourniquet. Early control prevented exsanguination. Key EMR skills: arterial bleed recognition, decisive tourniquet use, hypoperfusion prevention, rapid ALS activation.",
    vitals: {
      hr: 110,
      bp: { systolic: 108, diastolic: 64 },
      rr: 20,
      spo2: 99,
      skin: "Pale, stable",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};

export const venousLegScenario: Scenario = {
  initial: {
    title: "Kitchen Laceration",
    text:
      "A 54-year-old male cut his lower leg on broken glass. Blood is dark red and flowing steadily. The wound is deep and the current bandage is soaked.",
    vitals: {
      hr: 112,
      bp: { systolic: 118, diastolic: 76 },
      rr: 22,
      spo2: 98,
      skin: "Pale, anxious",
    },
    options: [
      {
        text: "Apply firm direct pressure with clean gauze and wrap a snug pressure bandage",
        next: "pressure_bandage",
        points: 10,
      },
      {
        text: "Apply a tourniquet immediately",
        next: "unneeded_tq",
        points: -3,
        isWrong: true,
        feedback:
          "This appears to be venous bleeding. Try direct pressure and a pressure bandage first; tourniquets are for life-threatening hemorrhage.",
      },
      {
        text: "Elevate the leg while maintaining direct pressure",
        next: "pressure_bandage",
        points: 5,
      },
    ],
  },
  pressure_bandage: {
    title: "Pressure Bandage Applied",
    text:
      "You stack gauze, apply firm pressure, and wrap a pressure bandage. Bleeding is slowing but still oozing.",
    vitals: {
      hr: 106,
      bp: { systolic: 120, diastolic: 78 },
      rr: 20,
      spo2: 99,
      skin: "Pink, calmer",
    },
    options: [
      {
        text: "Add more gauze on top, tighten the wrap, maintain pressure for several minutes, check CSM",
        next: "controlled",
        points: 10,
      },
      {
        text: "Remove the dressing repeatedly to look at the wound",
        next: "losing_blood",
        points: -5,
        isWrong: true,
        feedback:
          "Peeking breaks clots. Leave the dressing in place, reinforce, and keep pressure steady.",
      },
    ],
  },
  unneeded_tq: {
    title: "Tourniquet Overuse",
    text:
      "You apply a tourniquet even though bleeding was venous. It stops the bleeding but is more aggressive than needed.",
    vitals: {
      hr: 104,
      bp: { systolic: 122, diastolic: 80 },
      rr: 20,
      spo2: 99,
      skin: "Pale, stable",
    },
    options: [
      {
        text: "Convert to pressure bandage if safe, monitor circulation, and prepare for transport",
        next: "controlled",
        points: 4,
      },
    ],
  },
  losing_blood: {
    title: "Bleeding Persists",
    text:
      "Bleeding continues to ooze because the dressing was loosened frequently. The patient reports feeling weak.",
    vitals: {
      hr: 118,
      bp: { systolic: 112, diastolic: 72 },
      rr: 22,
      spo2: 98,
      skin: "Pale",
    },
    options: [
      {
        text: "Reinforce with more gauze, tighten the wrap, keep steady pressure, reassess CSM",
        next: "controlled",
        points: 5,
      },
    ],
  },
  controlled: {
    title: "Venous Bleeding Controlled",
    text:
      "The pressure bandage stays snug and the bleeding has stopped. The patient says he feels better.",
    vitals: {
      hr: 100,
      bp: { systolic: 124, diastolic: 80 },
      rr: 18,
      spo2: 99,
      skin: "Warm, pink",
    },
    options: [
      {
        text: "Monitor, keep the leg still, recheck circulation/sensation/movement",
        next: "success",
        points: 8,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You identified venous bleeding and controlled it with firm pressure and a proper pressure bandage. Key EMR skills: reinforcement rather than frequent removal, CSM checks, monitoring for shock signs.",
    vitals: {
      hr: 96,
      bp: { systolic: 126, diastolic: 82 },
      rr: 16,
      spo2: 100,
      skin: "Stable",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};

export const capillaryKneeScenario: Scenario = {
  initial: {
    title: "PE Class Fall",
    text:
      "A 16-year-old scraped their knee during PE. Blood is slowly oozing. The wound is dirty with gravel but there are no signs of shock.",
    vitals: {
      hr: 84,
      bp: { systolic: 118, diastolic: 78 },
      rr: 16,
      spo2: 99,
      skin: "Warm, dry",
    },
    options: [
      {
        text: "Use BSI, gently clean out debris, apply a sterile dressing and light bandage",
        next: "success",
        points: 10,
      },
      {
        text: "Leave gravel in, wrap tightly to hide the wound",
        next: "infection_risk",
        points: -5,
        isWrong: true,
        feedback:
          "Contaminants increase infection risk. Clean gently, then dress. Bandages should be snug, not constricting.",
      },
      {
        text: "Apply a tourniquet for the oozing",
        next: "overkill",
        points: -10,
        isWrong: true,
        feedback:
          "Capillary oozing does not need a tourniquet. Use simple cleaning and dressing.",
      },
    ],
  },
  infection_risk: {
    title: "Infection Risk",
    text:
      "You wrapped over debris. The wound remains dirty and could get infected.",
    vitals: null,
    options: [
      {
        text: "Remove the bandage, clean the wound gently, apply sterile dressing",
        next: "success",
        points: 6,
      },
    ],
  },
  overkill: {
    title: "Unnecessary Tourniquet",
    text:
      "A tourniquet for a superficial abrasion is excessive. Circulation could be compromised.",
    vitals: null,
    options: [
      {
        text: "Remove the tourniquet, clean and dress the wound appropriately",
        next: "success",
        points: 4,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You cleaned and dressed the abrasion correctly. Bleeding stopped with simple care. Key EMR skills: BSI, gentle wound cleaning, correct dressing choice, infection prevention.",
    vitals: {
      hr: 80,
      bp: { systolic: 118, diastolic: 78 },
      rr: 14,
      spo2: 99,
      skin: "Normal",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};

export const bleedingFractureScenario: Scenario = {
  initial: {
    title: "Fall from Ladder",
    text:
      "A 42-year-old male fell from a ladder. His forearm is bleeding and visibly deformed. He reports pain with movement.",
    vitals: {
      hr: 112,
      bp: { systolic: 116, diastolic: 74 },
      rr: 20,
      spo2: 98,
      skin: "Pale, anxious",
    },
    options: [
      {
        text: "Control bleeding with gentle direct pressure, pad and splint in position found, check CSM",
        next: "splint",
        points: 12,
      },
      {
        text: "Elevate the injured arm above the heart",
        next: "aggravated",
        points: -5,
        isWrong: true,
        feedback:
          "Do not elevate a suspected fracture; it can worsen injury and pain. Control bleeding without moving the limb.",
      },
      {
        text: "Forcefully straighten the arm before addressing bleeding",
        next: "aggravated",
        points: -8,
        isWrong: true,
        feedback:
          "Do not manipulate deformities in the field. Splint in the position found unless there is no pulse and protocols allow gentle realignment.",
      },
      {
        text: "Ignore bleeding until after splinting is complete",
        next: "aggravated",
        points: -4,
        isWrong: true,
        feedback:
          "Control bleeding first, then splint to protect the injury and maintain circulation.",
      },
    ],
  },
  splint: {
    title: "Splinting with Bleeding Control",
    text:
      "You apply padded dressings around the wound, maintain gentle pressure, and splint the arm in the position found. Bleeding slows.",
    vitals: {
      hr: 104,
      bp: { systolic: 118, diastolic: 76 },
      rr: 18,
      spo2: 99,
      skin: "Pale, stable",
    },
    options: [
      {
        text: "Recheck circulation, sensation, movement after splinting; adjust wrap if circulation is compromised",
        next: "success",
        points: 10,
      },
      {
        text: "Cover the fingers completely and tighten the wrap hard",
        next: "circulation_issue",
        points: -4,
        isWrong: true,
        feedback:
          "You need to see and feel distal circulation. Over-tightening can cut off blood flow.",
      },
    ],
  },
  aggravated: {
    title: "Pain and Worsening Bleeding",
    text:
      "Moving the arm worsened pain and bleeding. The deformity looks more swollen.",
    vitals: {
      hr: 118,
      bp: { systolic: 112, diastolic: 72 },
      rr: 22,
      spo2: 98,
      skin: "Pale",
    },
    options: [
      {
        text: "Stop manipulating, pad, control bleeding, splint as found, check CSM",
        next: "splint",
        points: 5,
      },
    ],
  },
  circulation_issue: {
    title: "Compromised Circulation",
    text:
      "Fingers are pale and cool under the wrap.",
    vitals: null,
    options: [
      {
        text: "Loosen the wrap, re-pad, ensure distal circulation, reassess CSM",
        next: "success",
        points: 6,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You controlled bleeding without worsening the fracture, splinted in position found, and monitored distal circulation. Key EMR skills: bleeding control with immobilization, avoiding elevation of fractures, constant CSM checks.",
    vitals: {
      hr: 96,
      bp: { systolic: 122, diastolic: 78 },
      rr: 16,
      spo2: 99,
      skin: "Warm, stable",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};

export const tightBandageScenario: Scenario = {
  initial: {
    title: "Overtight Bandage",
    text:
      "A bystander applied a very tight bandage to a bleeding hand wound. Bleeding appears controlled, but the fingers are pale and cool.",
    vitals: {
      hr: 90,
      bp: { systolic: 122, diastolic: 80 },
      rr: 16,
      spo2: 99,
      skin: "Pale fingers, normal elsewhere",
    },
    options: [
      {
        text: "Loosen and reapply the bandage to restore circulation; keep wound covered but fingers visible",
        next: "success",
        points: 12,
      },
      {
        text: "Leave it tight since bleeding is stopped",
        next: "ischemia",
        points: -8,
        isWrong: true,
        feedback:
          "Stopping bleeding is good, but cutting off circulation risks tissue damage. Always check distal CSM and adjust.",
      },
      {
        text: "Add another layer even tighter to be safe",
        next: "ischemia",
        points: -10,
        isWrong: true,
        feedback:
          "Over-tightening worsens circulation. You must balance bleeding control with perfusion.",
      },
    ],
  },
  ischemia: {
    title: "Poor Circulation",
    text:
      "Fingers remain pale and numb. The bandage is too tight.",
    vitals: null,
    options: [
      {
        text: "Loosen, rewrap with proper tension, reassess CSM",
        next: "success",
        points: 8,
      },
    ],
  },
  success: {
    title: "Patient Outcome",
    text:
      "You corrected the bandage, restored distal circulation, and maintained bleeding control. Key EMR skills: proper bandage tension, leaving fingers visible, repeated CSM checks.",
    vitals: {
      hr: 84,
      bp: { systolic: 120, diastolic: 78 },
      rr: 14,
      spo2: 99,
      skin: "Warm fingers",
    },
    options: [
      {
        text: "Review scenario",
        next: "initial",
        points: 0,
      },
    ],
  },
};
