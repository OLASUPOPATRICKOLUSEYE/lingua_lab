import type { RecorderActivityConfig } from "@/components/recorder/recorder-utils";

export interface StudentAssignment {
  id: string;
  title: string;
  summary: string;
  coachNote: string;
  moodLabel: string;
  focusLabel: string;
  activity: RecorderActivityConfig;
}

export const STUDENT_ASSIGNMENTS: StudentAssignment[] = [
  {
    id: "french-station-passage",
    title: "French Passage",
    summary:
      "Read the passage in French, then compare your delivery with your teacher's own reference reading.",
    coachNote:
      "Keep your phrases connected, do not rush the nasal sounds, and finish each sentence cleanly.",
    moodLabel: "French reading",
    focusLabel: "Pronunciation and pacing",
    activity: {
      id: "french-station-passage",
      prompt:
        "Read the full passage in French. Use your teacher's reference reading as the model for rhythm and pronunciation.",
      targetLanguage: "French",
      passageTitle: "La gare du matin",
      passageText:
        "Ce matin, Amina arrive a la gare tres tot. Elle regarde le tableau, trouve son train, puis elle attend calmement sur le quai. Quand le train arrive, elle monte, s'assoit pres de la fenetre, et relit son devoir de francais pendant le voyage.",
      teacherName: "Mme Moreau",
      teacherReferenceText:
        "Ce matin, Amina arrive a la gare tres tot. Elle regarde le tableau, trouve son train, puis elle attend calmement sur le quai. Quand le train arrive, elle monte, s'assoit pres de la fenetre, et relit son devoir de francais pendant le voyage.",
      teacherReferenceAudioUrl: null,
      teacherReferenceVideoUrl: null,
      submissionModes: ["audio", "video"],
      timeLimitSeconds: 90,
    },
  },
  {
    id: "english-rainy-day-passage",
    title: "English Passage",
    summary:
      "Read the passage in English and match the teacher's own model for phrasing, clarity, and fluency.",
    coachNote:
      "Keep your pauses natural, land the sentence endings clearly, and avoid swallowing quiet words.",
    moodLabel: "English reading",
    focusLabel: "Fluency and expression",
    activity: {
      id: "english-rainy-day-passage",
      prompt:
        "Read the full passage in English. Use the teacher's reading as the reference for stress, pauses, and overall flow.",
      targetLanguage: "English",
      passageTitle: "A rainy afternoon",
      passageText:
        "After school, Daniel walked home under a grey sky. The rain started softly, then grew heavier as he crossed the small bridge near his street. He opened his bag, checked that his books were dry, and hurried home with a smile, already thinking about the tea waiting for him.",
      teacherName: "Mr Chen",
      teacherReferenceText:
        "After school, Daniel walked home under a grey sky. The rain started softly, then grew heavier as he crossed the small bridge near his street. He opened his bag, checked that his books were dry, and hurried home with a smile, already thinking about the tea waiting for him.",
      teacherReferenceAudioUrl: null,
      teacherReferenceVideoUrl: null,
      submissionModes: ["audio", "video"],
      timeLimitSeconds: 90,
    },
  },
];

export function getStudentAssignment(id: string): StudentAssignment | null {
  return STUDENT_ASSIGNMENTS.find((assignment) => assignment.id === id) ?? null;
}
