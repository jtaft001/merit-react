import type { Scenario } from "./types";

export const anaphylacticScenario: Scenario = {
    initial: {
      title: "Dispatch",
      text:
        "You are dispatched to a restaurant for a person having an allergic reaction. Caller says the patient is having trouble breathing. Police are directing traffic. This is a medical emergency.",
      vitals: null,
      options: [
        {
          text: "Respond emergency, grab oxygen and AED",
          next: "arrival",
          points: 10,
        },
        {
          text: "Respond routine",
          next: "arrival",
          points: 5,
        },
      ],
    },
    arrival: {
      title: "Critical Patient",
      text:
        "You find a 24-year-old woman sitting at a table in obvious distress. Her face and lips are very swollen. She has red welts all over her arms. She is struggling to breathe. You can hear a high-pitched sound when she breathes in. Her friends say she ate shrimp and she is allergic to shellfish.",
      vitals: {
        hr: 138,
        bp: { systolic: 78, diastolic: 44 },
        rr: 36,
        spo2: 86,
        gcs: 14,
        skin: "Flushed, hives, swelling",
      },
      options: [
        {
          text:
            "Apply high-flow oxygen, ask if she has an EpiPen, call for ALS immediately",
          next: "oxygen_epipen",
          points: 15,
        },
        {
          text: "Help her to lie down flat",
          next: "wrong_position",
          points: -5,
          isWrong: true,
          feedback:
            "This makes the airway swelling worse and is very dangerous in anaphylaxis. When a patient lies flat during anaphylaxis: (1) Gravity pulls swelling fluid into the throat, making the airway close faster. (2) The tongue can fall back and block the airway. (3) If they vomit (common in anaphylaxis), they can aspirate while lying flat. (4) It is harder to breathe lying down. (5) Low blood pressure gets worse when they stand up after lying down. Keep anaphylaxis patients sitting upright until they lose consciousness. Only lay them down if they pass out. Sitting up keeps the airway as open as possible while you get help and find their EpiPen.",
        },
        {
          text: "Get detailed allergy history first",
          next: "oxygen_epipen",
          points: 0,
        },
      ],
    },
    // added: specific scene for wrong position in anaphylaxis
    wrong_position: {
      title: "Wrong Positioning",
      text:
        "Lying flat worsens airway swelling and breathing in anaphylaxis. The patient's airway can close faster. Keep patients upright until they lose consciousness; only lay them down if they pass out.",
      vitals: null,
      options: [
        {
          text: "Assist them to a position of comfort and continue oxygen",
          next: "oxygen_epipen",
          points: -5,
        },
      ],
    },
    oxygen_epipen: {
      title: "Critical Interventions",
      text:
        "You apply high-flow oxygen. Your partner calls for ALS. You ask if she has an EpiPen. Her friend runs to her purse and brings you an EpiPen auto-injector. The patient is getting worse quickly. Her lips are turning blue. This is life-threatening.",
      vitals: {
        hr: 142,
        bp: { systolic: 76, diastolic: 42 },
        rr: 38,
        spo2: 84,
        gcs: 14,
        skin: "Pale, severe hives, facial swelling",
      },
      options: [
        {
          text:
            "Help her use her EpiPen immediately - inject into outer thigh",
          next: "epipen_given",
          points: 20,
        },
        {
          text: "Wait for paramedics to give the EpiPen",
          next: "dangerous_delay",
          points: -10,
          isWrong: true,
          feedback:
            "This delay can be FATAL. Anaphylaxis can kill in minutes. The patient's airway is swelling shut and her blood pressure is dropping. Every second counts. As an EMR, you CAN and SHOULD help patients use their own prescribed EpiPen in a life-threatening emergency. The law protects you when acting in good faith during an emergency. Waiting for paramedics means this patient could die from a closed airway or cardiac arrest before they arrive. When someone has anaphylaxis and their own EpiPen, help them use it IMMEDIATELY - you could save their life.",
        },
        {
          text: "Check the expiration date on the EpiPen first",
          next: "epipen_given",
          points: 5,
        },
      ],
    },
    epipen_given: {
      title: "EpiPen Administration",
      text:
        "You help her use the EpiPen. You remove the blue safety cap, place the orange tip against her outer thigh, and push hard until it clicks. You hold it for 10 seconds. Within 2 minutes, she can breathe a little easier. The swelling is still there but she says she feels better. Her color improves slightly.",
      vitals: {
        hr: 136,
        bp: { systolic: 88, diastolic: 50 },
        rr: 32,
        spo2: 90,
        gcs: 14,
        skin: "Pink returning, hives present",
      },
      options: [
        {
          text:
            "Keep oxygen on, monitor her closely, be ready to use second EpiPen if she gets worse",
          next: "monitoring",
          points: 10,
        },
        {
          text: "She is better now, she can refuse transport",
          next: "refusal_error",
          points: -15,
        },
      ],
    },
    monitoring: {
      title: "Continued Care",
      text:
        "You keep her on oxygen and watch her closely. ALS arrives in 3 minutes. You tell them about the shrimp, the EpiPen you helped her use, and that she is breathing better but still has swelling and hives. Her friend gives you the used EpiPen to show the paramedics.",
      vitals: {
        hr: 130,
        bp: { systolic: 92, diastolic: 54 },
        rr: 28,
        spo2: 94,
        gcs: 15,
        skin: "Pink, hives fading",
      },
      options: [
        {
          text: "Give good report to ALS and help with transport",
          next: "als_handoff",
          points: 10,
        },
      ],
    },
    als_handoff: {
      title: "ALS Transport",
      text:
        "Paramedics take over care. They start an IV and give more medications. They explain she needs to go to the hospital because the allergic reaction can come back in a few hours. You help carry equipment to the ambulance.",
      vitals: {
        hr: 124,
        bp: { systolic: 98, diastolic: 58 },
        rr: 24,
        spo2: 96,
        gcs: 15,
        skin: "Pink, minimal hives",
      },
      options: [
        {
          text: "Complete your documentation and clear the scene",
          next: "success",
          points: 10,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You saved this woman's life by acting fast. She was having anaphylaxis, a severe allergic reaction that can kill within minutes. The EpiPen you helped her use opened her airway and raised her blood pressure. She was observed in the hospital for several hours and had no further problems. Your quick recognition and helping with her EpiPen made the difference. Key EMR skills: recognizing anaphylaxis (swelling, hives, breathing trouble, shock after exposure to allergen), oxygen therapy, assisting patient with their own EpiPen, calling for ALS, monitoring for worsening.",
      vitals: {
        hr: 110,
        bp: { systolic: 104, diastolic: 62 },
        rr: 20,
        spo2: 98,
        gcs: 15,
        skin: "Normal, trace hives",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    dangerous_delay: {
      title: "Fatal Mistake",
      text:
        "You wait for paramedics. Within 90 seconds, the patient's airway closes completely. She stops breathing. Her heart rate drops. She loses consciousness. You now need to start CPR. She might not survive because of the delay. When someone has their own EpiPen for a severe allergic reaction, help them use it immediately.",
      vitals: {
        hr: 42,
        bp: { systolic: 100, diastolic: 60 },
        rr: 0,
        spo2: 0,
        gcs: 3,
        skin: "Blue, swollen",
      },
      options: [
        {
          text: "Start CPR immediately",
          next: "cpr_required",
          points: 5,
        },
      ],
    },
    cpr_required: {
      title: "Cardiac Arrest",
      text:
        "You start CPR. Paramedics arrive and take over. They intubate her and give multiple doses of epinephrine. She survives but has brain damage from lack of oxygen. Early EpiPen use could have prevented this.",
      vitals: null,
      options: [
        {
          text: "Review scenario and learn from this",
          next: "initial",
          points: 0,
        },
      ],
    },
    refusal_error: {
      title: "Critical Error in Judgment",
      text:
        "You let her refuse transport because she feels better. Two hours later, she has another reaction called a biphasic response. This time she is home alone and dies before help arrives. Anyone who uses an EpiPen must go to the hospital, no exceptions.",
      vitals: null,
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
  }
