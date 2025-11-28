// src/scenarios/shock/hypovolemic.ts
import type { Scenario } from "./types";

export const hypovolemicScenario: Scenario = {
    initial: {
      title: "Dispatch",
      text:
        "You are dispatched as first responder to a motorcycle crash on Main Street. Dispatch reports one patient with injuries. Police and fire are also responding. You arrive first.",
      vitals: null,
      options: [
        {
          text: "Check scene safety, then approach patient",
          next: "scene_safety",
          points: 10,
        },
        {
          text: "Run directly to patient",
          next: "unsafe_approach",
          points: -5,
          isWrong: true,
          feedback:
            "You ran toward the patient without checking for hazards. This is dangerous. At crash scenes there can be traffic, fire, chemical spills, downed power lines, or unstable vehicles. If you get hurt, you cannot help anyone. Scene safety ALWAYS comes first - for you, your crew, then the patient. A dead rescuer helps no one.",
        },
      ],
    },
    scene_safety: {
      title: "Scene Size-Up",
      text:
        "You confirm the scene is safe. Traffic is controlled. You see a motorcycle down and one patient on the ground about 20 feet away. As you approach with your jump bag, you see the patient is a young male lying on his side. His right leg looks deformed.",
      vitals: null,
      options: [
        {
          text: "Put on gloves, introduce yourself, start ABCs assessment",
          next: "initial_assessment",
          points: 10,
        },
        {
          text: "Check for medical alert bracelet first",
          next: "initial_assessment",
          points: 0,
        },
      ],
    },
    initial_assessment: {
      title: "Primary Assessment",
      text:
        "Patient is conscious, airway open. He is breathing fast and shallow. His face is pale and sweaty. He tells you his name is Mike. You see blood soaking through his jeans on the right thigh. His right leg is bent at an odd angle.",
      vitals: {
        hr: 132,
        bp: { systolic: 80, diastolic: 48 },
        rr: 28,
        spo2: 92,
        gcs: 14,
        skin: "Pale, cool, sweaty",
      },
      options: [
        {
          text: "Control bleeding with direct pressure, call for ALS immediately",
          next: "bleeding_control",
          points: 15,
        },
        {
          text: "Splint the leg first, then address bleeding",
          next: "initial_assessment",
          points: -5,
          isWrong: true,
          feedback:
            "You must control life-threatening bleeding BEFORE splinting. The patient is losing blood rapidly from his thigh. Every second you waste trying to splint, he is getting closer to death from blood loss. Remember the priority: Massive hemorrhage control comes before airway, breathing, circulation, everything. Stop the bleeding first, then you can splint. Always address life threats in order of what will kill fastest.",
        },
        {
          text: "Have bystander call 911 for ambulance while you assess",
          next: "delayed_als",
          points: 5,
        },
      ],
    },
    // added: handle case where ALS is delayed or caller-only notification
    delayed_als: {
      title: "Delayed ALS Call",
      text:
        "A bystander calls 911 while you continue assessment. ALS is on the way but may be delayed. You must continue critical care: control bleeding, support airway and breathing, and keep the patient warm.",
      vitals: null,
      options: [
        {
          text: "Continue immediate hemorrhage control and prepare for ALS arrival",
          next: "bleeding_control",
          points: 5,
        },
      ],
    },
    bleeding_control: {
      title: "Hemorrhage Control",
      text:
        "You expose the wound and find a 4-inch laceration on the thigh with steady bleeding. You apply direct pressure with gauze. Your partner calls for ALS and ambulance. After 2 minutes of pressure, bleeding slows. Patient says he feels dizzy and cold.",
      vitals: {
        hr: 138,
        bp: { systolic: 92, diastolic: 58 },
        rr: 28,
        spo2: 90,
        gcs: 14,
        skin: "Very pale, cold, clammy",
      },
      options: [
        {
          text: "Apply pressure dressing, give high-flow oxygen, keep patient warm",
          next: "shock_treatment",
          points: 15,
        },
        {
          text: "Keep holding direct pressure, wait for ambulance",
          next: "incomplete_care",
          points: 5,
        },
        {
          text: "Apply tourniquet above the wound",
          next: "unnecessary_tourniquet",
          points: 3,
        },
      ],
    },
    // added: consequences of passive/incomplete care while waiting
    incomplete_care: {
      title: "Incomplete Care",
      text:
        "You keep holding pressure but delay additional simple interventions and monitoring while waiting. The bleeding is slower but the patient remains unstable. Continue monitoring and be prepared to escalate when ALS arrives.",
      vitals: null,
      options: [
        {
          text: "Apply pressure dressing and proceed with shock management",
          next: "shock_treatment",
          points: 3,
        },
      ],
    },
    // added: unnecessary tourniquet consequences
    unnecessary_tourniquet: {
      title: "Unnecessary Tourniquet",
      text:
        "You apply a tourniquet even though direct pressure and dressings were sufficient. While a tourniquet can save a life, unnecessary use can cause harm and complicate definitive care. ALS will evaluate and adjust.",
      vitals: null,
      options: [
        {
          text: "Reassess bleeding control and keep patient warm while awaiting ALS",
          next: "shock_treatment",
          points: 0,
        },
      ],
    },
    shock_treatment: {
      title: "Recognizing Shock",
      text:
        "You apply a pressure dressing. Bleeding is controlled. You place patient on high-flow oxygen via non-rebreather mask. You cover him with a blanket. His pulse is fast and weak. Skin is pale, cold, and sweaty. These are signs of shock from blood loss. ALS is 5 minutes out.",
      vitals: {
        hr: 134,
        bp: { systolic: 84, diastolic: 48 },
        rr: 26,
        spo2: 94,
        gcs: 14,
        skin: "Pale, cold, sweaty",
      },
      options: [
        {
          text:
            "Keep patient lying flat, monitor ABCs, reassure him, prepare for ALS arrival",
          next: "als_arrival",
          points: 10,
        },
        {
          text: "Elevate his legs to help blood pressure",
          next: "shock_position",
          points: 8,
        },
        {
          text: "Give him water to drink",
          next: "oral_fluids_error",
          points: -10,
          isWrong: true,
          feedback:
            "NEVER give oral fluids to trauma patients or anyone in shock. Here is why: (1) He may need emergency surgery and food/liquid in the stomach increases risk of vomiting and aspiration during anesthesia. (2) Shock patients often vomit, and with altered mental status they can aspirate and die. (3) Oral fluids do not help shock - he needs IV fluids given by paramedics. (4) By mouth is too slow to help in an emergency. This is a critical error that could kill your patient.",
        },
      ],
    },
    als_arrival: {
      title: "ALS Handoff",
      text:
        "Paramedics arrive. You give them a clear report: motorcycle crash, obvious leg injury with controlled bleeding, signs of shock, oxygen applied, patient kept warm. You show them the wound. They immediately start IVs and prepare for rapid transport.",
      vitals: {
        hr: 132,
        bp: { systolic: 86, diastolic: 50 },
        rr: 24,
        spo2: 96,
        gcs: 14,
        skin: "Pale, cool",
      },
      options: [
        {
          text: "Help paramedics with equipment and patient movement",
          next: "success",
          points: 10,
        },
        {
          text: "Leave scene now that ALS is here",
          next: "poor_teamwork",
          points: 0,
        },
      ],
    },
    // added: leaving after ALS arrives
    poor_teamwork: {
      title: "Poor Teamwork",
      text:
        "You leave the scene once ALS arrives instead of assisting. While ALS takes over, teamwork and clear handoff are important for patient safety and continuity of care. Reflect on ways to improve teamwork for future responses.",
      vitals: null,
      options: [
        {
          text: "Review scenario and debrief",
          next: "initial",
          points: 0,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You helped control life-threatening bleeding and recognized shock early. You called for ALS immediately, gave oxygen, kept the patient warm, and prevented further harm. Your actions as first responder were critical. The patient had a broken femur with arterial bleeding. He went to surgery and recovered. Key EMR skills you used: scene safety, bleeding control, recognizing shock (fast weak pulse, pale cold sweaty skin, altered mental status), calling for help early, oxygen therapy, and preventing heat loss.",
      vitals: {
        hr: 128,
        bp: { systolic: 88, diastolic: 52 },
        rr: 22,
        spo2: 97,
        gcs: 15,
        skin: "Pale, warming",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    shock_position: {
      title: "Positioning for Shock",
      text:
        "You carefully elevate his legs about 12 inches, keeping the injured leg as stable as possible. This helps blood return to vital organs. Patient reports feeling slightly better. Paramedics arrive and you give them a report.",
      vitals: {
        hr: 130,
        bp: { systolic: 88, diastolic: 50 },
        rr: 26,
        spo2: 95,
        gcs: 14,
        skin: "Pale, cool",
      },
      options: [
        {
          text: "Help ALS team with patient care",
          next: "success",
          points: 10,
        },
      ],
    },
    unsafe_approach: {
      title: "Scene Safety First",
      text:
        "You run toward the patient without checking for hazards. Another responder yells at you to stop. There is gasoline leaking from the motorcycle. You could have been injured. Always ensure scene safety before entering.",
      vitals: null,
      options: [
        {
          text: "Step back, assess scene safety, then approach",
          next: "scene_safety",
          points: 5,
        },
      ],
    },
    oral_fluids_error: {
      title: "Critical Error",
      text:
        "You should never give oral fluids to a trauma patient or anyone in shock. They may need surgery and could aspirate. The patient needs IV fluids from ALS, not water by mouth.",
      vitals: {
        hr: 136,
        bp: { systolic: 82, diastolic: 46 },
        rr: 28,
        spo2: 93,
        gcs: 13,
        skin: "Pale, cold",
      },
      options: [
        {
          text: "Recognize the error, focus on what you CAN do as EMR",
          next: "correction",
          points: 3,
        },
      ],
    },
    correction: {
      title: "Back to Basics",
      text:
        "You refocus on your EMR skills: maintain bleeding control, give oxygen, keep patient warm, monitor his condition, and stay with him until ALS arrives. These are the critical interventions within your scope.",
      vitals: {
        hr: 134,
        bp: { systolic: 84, diastolic: 48 },
        rr: 26,
        spo2: 94,
        gcs: 14,
        skin: "Pale, cold",
      },
      options: [
        {
          text: "Continue monitoring and wait for ALS",
          next: "als_arrival",
          points: 5,
        },
      ],
    },
    wrong_order: {
      title: "Priorities Matter",
      text:
        "Bleeding control comes before splinting. The patient is losing blood rapidly. You waste valuable time trying to splint while blood continues to flow.",
      vitals: {
        hr: 142,
        bp: { systolic: 78, diastolic: 42 },
        rr: 30,
        spo2: 88,
        gcs: 13,
        skin: "Very pale, cold",
      },
      options: [
        {
          text: "Stop splinting, control bleeding now",
          next: "late_bleeding_control",
          points: 5,
        },
      ],
    },
    late_bleeding_control: {
      title: "Delayed but Corrected",
      text:
        "You now apply direct pressure to stop the bleeding. It takes longer than it should have. The patient lost more blood due to the delay. You apply oxygen and call for ALS.",
      vitals: {
        hr: 140,
        bp: { systolic: 80, diastolic: 44 },
        rr: 28,
        spo2: 90,
        gcs: 13,
        skin: "Very pale, cold",
      },
      options: [
        {
          text: "Continue care and wait for ALS",
          next: "als_arrival",
          points: 5,
        },
      ],
    },
  }
