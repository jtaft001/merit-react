import type { Scenario } from "./types";

export const septicScenario: Scenario = {
    initial: {
      title: "Dispatch",
      text:
        "You respond to a nursing home for a 78-year-old female who is confused and not acting right. Staff called because they are worried about her. You are first to arrive.",
      vitals: null,
      options: [
        {
          text: "Respond with appropriate equipment",
          next: "arrival",
          points: 10,
        },
        {
          text: "Respond without urgency",
          next: "arrival",
          points: 5,
        },
      ],
    },
    arrival: {
      title: "Initial Assessment",
      text:
        "Nurse leads you to the patient's room. You find an elderly woman in bed. She opens her eyes when you talk loudly but seems very confused. Staff says she was okay yesterday but has been getting worse. They noticed she has a fever. Her skin feels very warm when you touch her arm.",
      vitals: {
        hr: 128,
        bp: { systolic: 78, diastolic: 42 },
        rr: 32,
        spo2: 90,
        temp: 103.2,
        gcs: 12,
        skin: "Hot, flushed, dry",
      },
      options: [
        {
          text: "Check ABCs, apply oxygen, call for ALS ambulance immediately",
          next: "recognition",
          points: 15,
        },
        {
          text: "Ask staff detailed questions about her medical history first",
          next: "delayed_assessment",
          points: 3,
        },
        {
          text: "Try to cool her down with cold washcloths",
          next: "recognition",
          points: 0,
        },
      ],
    },
    recognition: {
      title: "Recognizing Septic Shock",
      text:
        "You put high-flow oxygen on her. Staff calls for ALS. You take vital signs and notice concerning signs: very high fever, fast heart rate, fast breathing, low blood pressure, confusion, and warm flushed skin. These signs together suggest serious infection affecting her whole body.",
      vitals: {
        hr: 132,
        bp: { systolic: 76, diastolic: 40 },
        rr: 34,
        spo2: 93,
        temp: 103.2,
        gcs: 12,
        skin: "Hot, flushed",
      },
      options: [
        {
          text:
            "Keep oxygen on, monitor ABCs closely, get information from staff while waiting",
          next: "information",
          points: 10,
        },
        {
          text: "Try to give her water to drink",
          next: "aspiration_risk",
          points: -10,
          isWrong: true,
          feedback:
            "This is extremely dangerous. The patient is confused (GCS 12) and cannot protect her airway properly. When you give water to someone with altered mental status, they can easily aspirate (breathe it into their lungs) instead of swallowing. This causes aspiration pneumonia, makes breathing worse, and can lead to death. NEVER give anything by mouth to patients who are: (1) confused or altered, (2) in shock, (3) having trouble breathing, (4) may need surgery, or (5) could vomit. This patient needs IV fluids from paramedics, not oral fluids from you.",
        },
        {
          text: "Take her temperature again to confirm",
          next: "information",
          points: 0,
        },
        {
          text: "Help her sit up in a chair",
          next: "information",
          points: -5,
          isWrong: true,
          feedback:
            "Moving a patient in shock is dangerous. She is very weak, confused, has low blood pressure, and is having trouble breathing. Moving her to a chair could cause her to fall, lose consciousness, or her condition could worsen suddenly. Keep her in bed where she is safe and stable. Monitor her ABCs and wait for the ambulance team who can safely move her with proper equipment and personnel.",
        },
      ],
    },
    information: {
      title: "Gathering History",
      text:
        "While monitoring the patient, you ask staff questions. They tell you she has diabetes and has had urinary tract infections before. She has been eating and drinking very little for 2 days. She usually walks with a walker but has been too weak today. You keep checking her ABCs. ALS is 4 minutes out.",
      vitals: {
        hr: 130,
        bp: { systolic: 78, diastolic: 42 },
        rr: 32,
        spo2: 94,
        temp: 103.2,
        gcs: 12,
        skin: "Hot, flushed",
      },
      options: [
        {
          text: "Continue oxygen and monitoring, prepare report for ALS",
          next: "als_arrival",
          points: 10,
        },
        {
          text: "Help her sit up in a chair",
          next: "movement_error",
          points: -5,
        },
      ],
    },
    // added: consequences of delaying initial assessment
    delayed_assessment: {
      title: "Delayed Assessment",
      text:
        "You spend time asking detailed history while the patient's condition worsens. In time-sensitive situations like suspected sepsis, rapid basic interventions and early ALS notification take priority.",
      vitals: null,
      options: [
        {
          text: "Apply oxygen and call for ALS immediately",
          next: "recognition",
          points: 0,
        },
      ],
    },
    // added: consequences of moving a weak, hypotensive, confused patient
    movement_error: {
      title: "Movement Error",
      text:
        "You help the patient sit up despite her confusion and low blood pressure. She becomes weaker and further compromised. Keep such patients where they are and await trained assistance unless movement is necessary for airway management.",
      vitals: null,
      options: [
        {
          text: "Stabilize and wait for ALS",
          next: "als_arrival",
          points: -3,
        },
      ],
    },
    als_arrival: {
      title: "ALS Handoff",
      text:
        "Paramedics arrive. You give them a clear report: 78-year-old female, confused since yesterday, high fever, fast heart rate and breathing, low blood pressure, warm skin, decreased eating and drinking, history of diabetes and UTIs, oxygen applied. They recognize this as septic shock and prepare for rapid transport.",
      vitals: {
        hr: 128,
        bp: { systolic: 78, diastolic: 42 },
        rr: 30,
        spo2: 95,
        temp: 103.0,
        gcs: 13,
        skin: "Hot, flushed",
      },
      options: [
        {
          text: "Help move patient to stretcher and gather her medications",
          next: "success",
          points: 10,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You recognized the signs of serious infection with shock. You gave oxygen, called for ALS quickly, and gave a good report. The patient had a severe urinary tract infection that spread to her blood. Paramedics started IVs with fluids and rushed her to the hospital where she got antibiotics. She spent time in ICU but recovered. Your early recognition was important because septic shock can kill quickly. Key EMR skills: recognizing shock in elderly patients (confusion, fever, low BP, fast pulse), oxygen therapy, calling for help early, good information gathering and reporting.",
      vitals: {
        hr: 124,
        bp: { systolic: 80, diastolic: 44 },
        rr: 28,
        spo2: 96,
        temp: 102.8,
        gcs: 13,
        skin: "Warm, flushed",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    aspiration_risk: {
      title: "Dangerous Action",
      text:
        "You try to give her water. She is confused and cannot protect her airway well. She starts coughing and choking. Water goes into her lungs. Never give oral fluids to someone who is confused or has altered mental status.",
      vitals: {
        hr: 138,
        bp: { systolic: 74, diastolic: 40 },
        rr: 38,
        spo2: 86,
        gcs: 11,
        skin: "Hot, flushed",
      },
      options: [
        {
          text: "Turn her on her side, suction if available, increase oxygen",
          next: "recovery",
          points: 5,
        },
      ],
    },
    recovery: {
      title: "Managing the Complication",
      text:
        "You turn her on her side and suction her mouth. You increase oxygen flow. ALS arrives and takes over care. The aspiration made her condition worse but she eventually recovered.",
      vitals: {
        hr: 136,
        bp: { systolic: 76, diastolic: 40 },
        rr: 36,
        spo2: 90,
        gcs: 11,
        skin: "Hot, flushed",
      },
      options: [
        {
          text: "Help ALS with equipment",
          next: "complicated_outcome",
          points: 3,
        },
      ],
    },
    complicated_outcome: {
      title: "Learning from Mistakes",
      text:
        "The patient recovered but had a longer hospital stay because of the aspiration pneumonia you caused. Always remember: never give oral fluids to anyone with altered mental status, shock, or who may need surgery.",
      vitals: {
        hr: 134,
        bp: { systolic: 78, diastolic: 42 },
        rr: 34,
        spo2: 92,
        gcs: 12,
        skin: "Hot",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
  }
