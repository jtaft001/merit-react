import type { Scenario } from "./types";

export const cardiogenicScenario: Scenario = {
initial: {
      title: "Dispatch",
      text:
        "You respond as first responder to a 62-year-old male with chest pain. Family called 911. Address is a residential home. Ambulance is also responding but you will arrive first.",
      vitals: null,
      options: [
        {
          text: "Respond quickly, grab AED and oxygen",
          next: "arrival",
          points: 10,
        },
        {
          text: "Respond without equipment",
          next: "arrival",
          points: 5,
        },
      ],
    },
    arrival: {
      title: "Patient Contact",
      text:
        "Wife meets you at door. She is very worried. She leads you to the living room where you find her husband sitting on the couch. He is pale, sweating heavily, and holding his chest. He tells you the pain started 30 minutes ago and is getting worse.",
      vitals: {
        hr: 118,
        bp: { systolic: 84, diastolic: 52 },
        rr: 26,
        spo2: 88,
        gcs: 15,
        skin: "Pale, very sweaty, cool",
      },
      options: [
        {
          text:
            "Put him on high-flow oxygen immediately, have wife call 911 for ALS if not done",
          next: "oxygen_applied",
          points: 10,
        },
        {
          text: "Ask detailed questions about his medical history first",
          next: "oxygen_applied",
          points: 3,
        },
        {
          text: "Have him lie flat on floor",
          next: "wrong_position",
          points: 0,
          isWrong: true,
          feedback:
            "This makes his breathing worse. When patients have heart problems and difficulty breathing, lying flat causes several problems: (1) More blood returns to the heart, which the failing heart cannot pump effectively. (2) Fluid backs up into the lungs, making breathing harder. (3) The diaphragm cannot move as well when lying flat. (4) The patient becomes more anxious and short of breath. Always let patients with chest pain and breathing trouble sit in their position of comfort - usually sitting upright or semi-reclined. If they want to lie down, let them, but most will want to sit up. Listen to your patient.",
        },
      ],
    },
    oxygen_applied: {
      title: "Initial Treatment",
      text:
        "You place him on high-flow oxygen with non-rebreather mask at 15 LPM. Wife confirms ALS ambulance is coming. Patient reports pain is crushing in center of chest. He is short of breath. His skin is very pale and sweaty. Pulse is fast and weak.",
      vitals: {
        hr: 122,
        bp: { systolic: 82, diastolic: 50 },
        rr: 26,
        spo2: 92,
        gcs: 15,
        skin: "Pale, sweaty, cool",
      },
      options: [
        {
          text:
            "Keep him in position of comfort, ask about medications, monitor closely",
          next: "assessment",
          points: 10,
        },
        {
          text: "Give him water to help him relax",
          next: "assessment",
          points: -5,
          isWrong: true,
          feedback:
            "Never give water or any oral fluids to someone having chest pain and in shock. He may need emergency procedures or surgery, and anything in his stomach increases the risk of vomiting and aspiration. Also, patients in shock often vomit, which could block his airway. If he needs fluids, paramedics will give them through an IV. Focus on oxygen, monitoring, and calling for help.",
        },
        {
          text: "Tell him to take deep breaths and calm down",
          next: "assessment",
          points: 0,
        },
      ],
    },
    assessment: {
      title: "Gathering Information",
      text:
        "You ask about medications. Wife brings you a bottle of nitroglycerin prescribed for chest pain. Patient also takes blood pressure medicine. He has history of high blood pressure and high cholesterol. You notice his pulse is very fast and weak. His blood pressure is low.",
      vitals: {
        hr: 126,
        bp: { systolic: 80, diastolic: 48 },
        rr: 28,
        spo2: 93,
        gcs: 15,
        skin: "Pale, sweaty",
      },
      options: [
        {
          text:
            "Do NOT give nitroglycerin with low blood pressure, wait for ALS, monitor ABCs",
          next: "correct_decision",
          points: 15,
        },
        {
          text: "Help him take one nitroglycerin tablet",
          next: "nitro_error",
          points: -10,
          isWrong: true,
          feedback:
            "This is a critical mistake. Nitroglycerin dilates blood vessels and drops blood pressure. This patient already has dangerously low blood pressure at 80/48. Giving nitroglycerin will drop it even more, potentially causing him to lose consciousness, have a stroke, or go into cardiac arrest. NEVER assist with nitroglycerin when systolic blood pressure is below 90 mmHg. You must check blood pressure before helping with ANY nitroglycerin dose. This patient needs IV fluids and medications from paramedics, not nitroglycerin.",
        },
        {
          text: "Ask if he took his blood pressure medicine today",
          next: "information_gathering",
          points: 8,
        },
      ],
    },
    // added: small scene for gathering specific medication info
    information_gathering: {
      title: "Medication Information",
      text:
        "You ask about recent medications. The wife reports he took his blood pressure medicine this morning. This information helps paramedics and shapes your decision to avoid nitroglycerin due to low blood pressure.",
      vitals: null,
      options: [
        {
          text: "Continue monitoring and withhold nitroglycerin",
          next: "correct_decision",
          points: 5,
        },
      ],
    },
    correct_decision: {
      title: "Good EMR Judgment",
      text:
        "You recognize this patient is very sick with low blood pressure. Nitroglycerin can drop blood pressure even more and could harm him. You continue oxygen, keep him comfortable, and monitor his ABCs. You reassure him and his wife that help is coming. Paramedics arrive in 3 minutes.",
      vitals: {
        hr: 128,
        bp: { systolic: 78, diastolic: 46 },
        rr: 26,
        spo2: 94,
        gcs: 15,
        skin: "Pale, sweaty",
      },
      options: [
        {
          text: "Give clear report to paramedics about what you found and did",
          next: "als_handoff",
          points: 10,
        },
      ],
    },
    als_handoff: {
      title: "ALS Arrival",
      text:
        "You tell paramedics: 62-year-old male with chest pain for 30 minutes, pale and sweaty, low blood pressure, fast weak pulse, short of breath, has nitro but you did not give it due to low BP, history of high blood pressure and high cholesterol, oxygen applied. They immediately prepare for transport to hospital with cardiac cath lab.",
      vitals: {
        hr: 126,
        bp: { systolic: 80, diastolic: 48 },
        rr: 24,
        spo2: 95,
        gcs: 15,
        skin: "Pale, sweaty",
      },
      options: [
        {
          text: "Help carry equipment and prepare for rapid transport",
          next: "success",
          points: 10,
        },
        {
          text: "Ask paramedics what they think is wrong",
          next: "learning_moment",
          points: 5,
        },
      ],
    },
    // added: brief learning moment after ALS arrival
    learning_moment: {
      title: "Learning Moment",
      text:
        "Paramedics explain their assessment and the likely diagnosis. You listen and ask questions — a great learning opportunity to understand advanced care decisions and improve future responses.",
      vitals: null,
      options: [
        {
          text: "Help prepare patient for rapid transport",
          next: "success",
          points: 5,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You helped save this man by recognizing he was very sick, giving oxygen quickly, and knowing NOT to give nitroglycerin when blood pressure is low. He was having a heart attack with shock. Paramedics started IVs and gave him medications. He went to the cardiac cath lab and had a blocked artery opened. Your early oxygen and good judgment made a difference. Key EMR skills: rapid oxygen therapy, recognizing shock (pale, sweaty, low BP, fast weak pulse), knowing when NOT to assist with medications, calling for ALS, giving good report.",
      vitals: {
        hr: 122,
        bp: { systolic: 82, diastolic: 50 },
        rr: 22,
        spo2: 96,
        gcs: 15,
        skin: "Pale, less sweaty",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    nitro_error: {
      title: "Critical Mistake",
      text:
        "You help him place a nitroglycerin tablet under his tongue. Within 2 minutes, his blood pressure drops to 68/40. He becomes very dizzy and confused. His wife is panicking. Nitroglycerin should NEVER be given when blood pressure is already low. You made his shock much worse.",
      vitals: {
        hr: 142,
        bp: { systolic: 68, diastolic: 40 },
        rr: 32,
        spo2: 90,
        gcs: 13,
        skin: "Very pale, cold",
      },
      options: [
        {
          text: "Lay him down, keep oxygen on, call for immediate ALS help",
          next: "emergency_response",
          points: 5,
        },
      ],
    },
    wrong_position: {
      title: "Position of Comfort",
      text:
        "You try to lay him flat. He becomes more short of breath and anxious. Patients with heart problems and breathing trouble should sit up in position of comfort, not lie flat.",
      vitals: {
        hr: 126,
        bp: { systolic: 82, diastolic: 48 },
        rr: 32,
        spo2: 86,
        gcs: 15,
        skin: "Pale, sweaty, anxious",
      },
      options: [
        {
          text: "Help him sit back up, apply oxygen",
          next: "correction",
          points: 5,
        },
      ],
    },
    correction: {
      title: "Correcting the Error",
      text:
        "You help him sit in a comfortable position. You apply high-flow oxygen. His breathing improves slightly. You wait for ALS to arrive.",
      vitals: {
        hr: 122,
        bp: { systolic: 82, diastolic: 50 },
        rr: 26,
        spo2: 92,
        gcs: 15,
        skin: "Pale, sweaty",
      },
      options: [
        {
          text: "Continue monitoring and be ready to help ALS",
          next: "als_handoff",
          points: 8,
        },
      ],
    },
    emergency_response: {
      title: "Emergency Management",
      text:
        "You lay him down flat and keep the oxygen on. Your partner radios for immediate ALS response. Paramedics arrive quickly and take over care. The patient survived but your error made his condition much worse.",
      vitals: {
        hr: 138,
        bp: { systolic: 72, diastolic: 42 },
        rr: 30,
        spo2: 91,
        gcs: 13,
        skin: "Very pale",
      },
      options: [
        {
          text: "Review scenario and learn",
          next: "initial",
          points: 0,
        },
      ],
    },
  }
