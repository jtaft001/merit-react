import type { Scenario } from "./types";

export const obstructiveScenario: Scenario = {
    initial: {
      title: "Dispatch",
      text:
        "You respond to a stabbing at a bar. Police on scene report one patient with a stab wound to the chest. Scene is secure. You are first medical unit to arrive.",
      vitals: null,
      options: [
        {
          text: "Confirm scene safety with police, then approach with equipment",
          next: "arrival",
          points: 10,
        },
        {
          text: "Wait in your vehicle until police say it is completely safe",
          next: "arrival",
          points: 5,
        },
      ],
    },
    arrival: {
      title: "Penetrating Chest Trauma",
      text:
        "Police confirm the scene is safe. The attacker is in custody. You find a 32-year-old male sitting on the ground leaning forward. He has a stab wound to the right side of his chest. He is in severe respiratory distress. He is very anxious and struggling to breathe. The veins in his neck look swollen.",
      vitals: {
        hr: 138,
        bp: { systolic: 82, diastolic: 46 },
        rr: 36,
        spo2: 86,
        gcs: 14,
        skin: "Pale, sweaty, cool",
      },
      options: [
        {
          text:
            "Apply high-flow oxygen, seal the wound, call for ALS immediately",
          next: "initial_care",
          points: 15,
        },
        {
          text: "Check the wound carefully to see how deep it is",
          next: "dangerous_probing",
          points: -10,
          isWrong: true,
          feedback:
            "NEVER probe, explore, or poke into stab wounds or gunshot wounds. Here is why: (1) You can push the weapon or object deeper, causing more internal damage. (2) You can dislodge blood clots and cause severe bleeding. (3) You can introduce infection. (4) You can damage nerves, blood vessels, or organs. (5) You waste critical time - the patient is in severe respiratory distress. Your job is to cover and seal the wound, not explore it. Only surgeons in the operating room should look inside penetrating wounds. Cover it, seal it, transport immediately.",
        },
        {
          text: "Lay him flat on his back",
          next: "wrong_position",
          points: -5,
        },
      ],
    },
    initial_care: {
      title: "Chest Wound Management",
      text:
        "You apply high-flow oxygen. Your partner calls for ALS trauma response. You quickly seal the chest wound with an occlusive dressing taped on three sides. The patient is getting worse. His neck veins are very swollen. His breathing is extremely labored. He looks terrified.",
      vitals: {
        hr: 148,
        bp: { systolic: 78, diastolic: 42 },
        rr: 40,
        spo2: 82,
        gcs: 13,
        skin: "Very pale, cold",
      },
      options: [
        {
          text:
            "Keep him in position of comfort, monitor closely, reassure him, wait for ALS",
          next: "als_arrival",
          points: 10,
        },
        {
          text: "Remove the dressing to check if it is helping",
          next: "wrong_action",
          points: -5,
        },
        {
          text: "Start CPR because he is in shock",
          next: "inappropriate_cpr",
          points: -10,
          isWrong: true,
          feedback:
            "This is completely wrong and dangerous. CPR is only for patients with no pulse (cardiac arrest). This patient is conscious (GCS 13), breathing on his own (40 breaths per minute), and has a pulse (148 bpm). He is in shock and severe respiratory distress, but his heart is beating. If you do chest compressions on someone with a beating heart, you can: (1) Cause the heart to stop, (2) Break ribs and damage internal organs, (3) Make his injuries worse, (4) Waste critical time. Check for a pulse BEFORE starting CPR. If there is a pulse, do NOT do compressions. This patient needs oxygen, wound care, and immediate ALS help - not CPR.",
        },
      ],
    },
    als_arrival: {
      title: "ALS Response",
      text:
        "Paramedics arrive in 3 minutes. You give report: stab wound right chest, severe respiratory distress, low blood pressure, swollen neck veins, wound sealed with three-sided dressing, oxygen applied. They recognize this as possible tension pneumothorax and prepare for immediate intervention.",
      vitals: {
        hr: 152,
        bp: { systolic: 74, diastolic: 40 },
        rr: 42,
        spo2: 80,
        gcs: 12,
        skin: "Pale, cool, anxious",
      },
      options: [
        {
          text: "Help them with equipment and be ready to assist",
          next: "als_treatment",
          points: 10,
        },
      ],
    },
    als_treatment: {
      title: "ALS Intervention",
      text:
        "The paramedic performs a needle decompression procedure. You hear a rush of air. The patient immediately breathes easier. His color starts to improve. They explain he had air trapped under pressure in his chest crushing his heart and lungs. This is called tension pneumothorax, a type of obstructive shock.",
      vitals: {
        hr: 132,
        bp: { systolic: 92, diastolic: 50 },
        rr: 28,
        spo2: 90,
        gcs: 14,
        skin: "Pale, improving",
      },
      options: [
        {
          text: "Help load patient for rapid transport to trauma center",
          next: "success",
          points: 10,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You recognized a critical chest injury and provided appropriate EMR care: oxygen, wound sealing, and immediate ALS response. The patient had a pneumothorax that became a tension pneumothorax - air trapped under pressure that squeezed the heart and lungs. Your wound sealing and early ALS call were important. The patient went to surgery and survived. Key EMR skills: scene safety confirmation, recognizing severe chest trauma, oxygen therapy, sealing chest wounds with three-sided dressing, recognizing signs of severe shock (swollen neck veins, very low BP, severe breathing trouble), calling for ALS immediately.",
      vitals: {
        hr: 118,
        bp: { systolic: 102, diastolic: 56 },
        rr: 22,
        spo2: 94,
        gcs: 15,
        skin: "Pink, warming",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    dangerous_probing: {
      title: "Never Probe Wounds",
      text:
        "You probe the wound to see how deep it is. This causes more bleeding and could push objects deeper. Never probe stab wounds or gunshot wounds. Just cover and seal them.",
      vitals: {
        hr: 152,
        bp: { systolic: 76, diastolic: 40 },
        rr: 42,
        spo2: 80,
        gcs: 12,
        skin: "Very pale, cold",
      },
      options: [
        {
          text: "Stop probing, seal the wound, call for ALS",
          next: "late_recognition",
          points: 5,
        },
      ],
    },
    // added: wrong_position for obstructive scenario
    wrong_position: {
      title: "Wrong Position",
      text:
        "Lying flat made his breathing worse. In severe respiratory distress let patients find the position of comfort unless you must move them for airway management.",
      vitals: null,
      options: [
        {
          text: "Help him sit up and continue oxygen",
          next: "initial_care",
          points: -3,
        },
      ],
    },
    // added: wrong_action when removing dressing
    wrong_action: {
      title: "Wrong Action",
      text:
        "You removed the occlusive dressing and made the patient worse. Keep sealed dressings in place and await trained ALS interventions unless instructed otherwise.",
      vitals: null,
      options: [
        {
          text: "Reapply seal and call for ALS",
          next: "als_arrival",
          points: -5,
        },
      ],
    },
    // added: late recognition after probing
    late_recognition: {
      title: "Late Recognition",
      text:
        "Because you probed the wound, recognition of the severity was delayed and bleeding worsened. You now focus on hemorrhage control and rapid transport.",
      vitals: null,
      options: [
        {
          text: "Control bleeding and prepare for ALS",
          next: "als_arrival",
          points: 3,
        },
      ],
    },
    inappropriate_cpr: {
      title: "Wrong Treatment",
      text:
        "You start CPR on a patient who is conscious and breathing. This is wrong and dangerous. He still has a pulse and is breathing, just very poorly. CPR is only for patients with no pulse.",
      vitals: {
        hr: 148,
        bp: { systolic: 78, diastolic: 42 },
        rr: 40,
        spo2: 82,
        gcs: 13,
        skin: "Pale, cold, terrified",
      },
      options: [
        {
          text: "Stop CPR, provide appropriate care",
          next: "correction",
          points: 3,
        },
      ],
    },
    correction: {
      title: "Correcting Errors",
      text:
        "You provide appropriate care now: oxygen, seal wound, position of comfort. ALS arrives and takes over. The patient survives but lost valuable time due to your initial errors.",
      vitals: {
        hr: 146,
        bp: { systolic: 80, diastolic: 44 },
        rr: 38,
        spo2: 84,
        gcs: 13,
        skin: "Pale, cold",
      },
      options: [
        {
          text: "Help ALS team",
          next: "delayed_outcome",
          points: 5,
        },
      ],
    },
    delayed_outcome: {
      title: "Learning Experience",
      text:
        "The patient survived but your initial errors cost valuable time. Remember: never probe wounds, keep chest trauma patients sitting up if they want to, and only do CPR when there is no pulse.",
      vitals: {
        hr: 128,
        bp: { systolic: 94, diastolic: 52 },
        rr: 26,
        spo2: 92,
        gcs: 14,
        skin: "Pale",
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
