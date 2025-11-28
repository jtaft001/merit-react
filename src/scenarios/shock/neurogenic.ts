import type { Scenario } from "./types";

export const neurogenicScenario: Scenario = {
    initial: {
      title: "Dispatch",
      text:
        "You respond to a pool for a diving accident. 19-year-old male dove into the shallow end. Bystanders pulled him from the water. He is conscious but not moving his legs. Fire department is responding for manpower.",
      vitals: null,
      options: [
        {
          text: "Respond emergency, expect spinal injury",
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
      title: "Scene Assessment",
      text:
        "Lifeguards pulled the patient from water and placed him on his back on the pool deck. They maintained head and neck support. Patient is awake and talking. He says he cannot move or feel his legs. His arms move a little. He is calm, not in pain. His skin is warm and dry even though he was just in the water.",
      vitals: {
        hr: 58,
        bp: { systolic: 88, diastolic: 52 },
        rr: 20,
        spo2: 97,
        temp: 97.2,
        gcs: 15,
        skin: "Warm, dry, pink",
      },
      options: [
        {
          text: "Maintain spinal precautions, apply oxygen, call for ALS immediately",
          next: "spinal_care",
          points: 15,
        },
        {
          text: "Check his blood pressure again because it seems wrong",
          next: "spinal_care",
          points: 0,
        },
        {
          text: "This is hypothermia from the pool, warm him up",
          next: "spinal_care",
          points: -5,
          isWrong: true,
          feedback:
            "This is NOT hypothermia. The patient was just pulled from the pool but his temperature is 97.2°F which is only slightly low. His warm, dry skin with low blood pressure and slow heart rate are classic signs of neurogenic shock from spinal cord injury, not hypothermia. In hypothermia, patients are cold and shivering. In neurogenic shock, they are warm because the spinal injury prevents blood vessels from constricting. Missing a spinal injury is dangerous. Always assume spinal injury in diving accidents.",
        },
      ],
    },
    spinal_care: {
      title: "Spinal Injury Recognition",
      text:
        "You apply high-flow oxygen. Your partner calls for ALS. You notice unusual signs: his blood pressure is low, his heart rate is slow, but his skin is warm and dry. Usually in shock, the heart rate is fast and skin is cold and sweaty. These different signs happen with spinal cord injuries that affect the nervous system.",
      vitals: {
        hr: 56,
        bp: { systolic: 86, diastolic: 50 },
        rr: 20,
        spo2: 98,
        temp: 97.4,
        gcs: 15,
        skin: "Warm, dry",
      },
      options: [
        {
          text:
            "Apply cervical collar, prepare backboard, keep him warm, monitor closely",
          next: "immobilization",
          points: 10,
        },
        {
          text: "Try to raise his blood pressure by having him drink water",
          next: "dangerous_action",
          points: -10,
          isWrong: true,
          feedback:
            "This is a critical error with multiple problems: (1) He has a suspected spinal cord injury and may need emergency surgery - nothing by mouth. (2) Spinal cord injuries can affect the muscles used for swallowing, causing aspiration. (3) Oral fluids do not raise blood pressure fast enough to help shock. (4) The low blood pressure is from the spinal injury disrupting his nervous system, not from dehydration - water will not fix this. (5) He could vomit and aspirate, especially if moved. NEVER give oral fluids to trauma patients. He needs IV fluids and possibly medications from paramedics to support his blood pressure.",
        },
        {
          text: "Test his reflexes with a pin",
          next: "immobilization",
          points: 0,
        },
      ],
    },
    immobilization: {
      title: "Spinal Immobilization",
      text:
        "You work with fire department to apply a cervical collar properly. You carefully log-roll him onto a backboard using manual inline stabilization. You secure him with straps and head blocks. He reports he still cannot feel or move his legs. ALS is 5 minutes out.",
      vitals: {
        hr: 54,
        bp: { systolic: 88, diastolic: 50 },
        rr: 20,
        spo2: 98,
        temp: 97.6,
        gcs: 15,
        skin: "Warm, dry",
      },
      options: [
        {
          text:
            "Cover him with blankets to prevent heat loss, continue monitoring",
          next: "als_arrival",
          points: 10,
        },
        {
          text: "Lay the board flat on the ground and leave him",
          next: "poor_care",
          points: -5,
        },
      ],
    },
    als_arrival: {
      title: "ALS Handoff",
      text:
        "Paramedics arrive. You give report: 19-year-old male, dove into shallow end, pulled from water by lifeguards, cannot move legs, some arm movement, no feeling below chest, low BP and slow pulse but warm dry skin, spinal precautions maintained, oxygen applied. They recognize this as neurogenic shock from spinal cord injury.",
      vitals: {
        hr: 56,
        bp: { systolic: 88, diastolic: 52 },
        rr: 18,
        spo2: 98,
        temp: 97.8,
        gcs: 15,
        skin: "Warm, dry",
      },
      options: [
        {
          text:
            "Help move him to the stretcher carefully maintaining spinal precautions",
          next: "success",
          points: 10,
        },
      ],
    },
    success: {
      title: "Patient Outcome",
      text:
        "You recognized a spinal cord injury and maintained excellent spinal precautions. You noticed the unusual signs of neurogenic shock: low blood pressure and slow heart rate with warm dry skin. This is different from other types of shock. The patient had a cervical spine fracture with spinal cord injury. He went to surgery for spinal stabilization. Your careful handling and recognition helped prevent further injury. Key EMR skills: spinal precautions, recognizing that warm skin with low BP and slow pulse is different from other shock, oxygen, calling for ALS, maintaining body temperature.",
      vitals: {
        hr: 58,
        bp: { systolic: 90, diastolic: 54 },
        rr: 18,
        spo2: 98,
        temp: 98.0,
        gcs: 15,
        skin: "Warm, dry",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    dangerous_action: {
      title: "Critical Error",
      text:
        "You try to have him drink water. He may need surgery and should have nothing by mouth. Also, spinal cord injuries can affect swallowing. He chokes on the water and it goes into his lungs.",
      vitals: {
        hr: 58,
        bp: { systolic: 86, diastolic: 48 },
        rr: 28,
        spo2: 92,
        gcs: 14,
        skin: "Warm, coughing",
      },
      options: [
        {
          text:
            "Turn him carefully on his side using spinal precautions, suction if available",
          next: "recovery",
          points: 5,
        },
      ],
    },
    recovery: {
      title: "Managing Complication",
      text:
        "You carefully log-roll him onto his side maintaining spinal alignment. You clear his airway. ALS arrives and takes over. The aspiration made things worse but you prevented additional spinal injury with good technique.",
      vitals: {
        hr: 60,
        bp: { systolic: 88, diastolic: 50 },
        rr: 26,
        spo2: 94,
        gcs: 14,
        skin: "Warm",
      },
      options: [
        {
          text: "Help ALS with careful patient movement",
          next: "complicated_outcome",
          points: 5,
        },
      ],
    },
    complicated_outcome: {
      title: "Learning from Mistakes",
      text:
        "The patient survived but had aspiration pneumonia and required mechanical ventilation. Always remember: never give oral fluids to trauma patients, especially those with possible spinal injuries.",
      vitals: {
        hr: 58,
        bp: { systolic: 88, diastolic: 52 },
        rr: 24,
        spo2: 96,
        gcs: 14,
        skin: "Warm",
      },
      options: [
        {
          text: "Review scenario",
          next: "initial",
          points: 0,
        },
      ],
    },
    // added: poor care outcome for leaving immobilized patient unattended
    poor_care: {
      title: "Poor Care",
      text:
        "You leave the patient secured on the board without monitoring or adequate team support. This neglect can worsen outcomes. ALS arrives and documents delays and complications.",
      vitals: null,
      options: [
        {
          text: "Review scenario and learn",
          next: "initial",
          points: -2,
        },
      ],
    },
  }
