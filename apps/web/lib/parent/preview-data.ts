// HARD-CODED SAMPLE DATA for the /parent/preview page: how the parent view could look after a few
// weeks of watching. Nothing here comes from a real child or a real session. The page labels it
// as a sample on every section. It never feeds the real counts, live view or insights.
//
// Wording stays within learning-progress-plan.md §3: counts of what happened ("answered on the
// first try", "after help"), never "mastered" or a test score.

export type SkillStatus = "first_try" | "after_help" | "practicing" | "up_next";

export type PreviewSkill = { name: string; grade: 1 | 2; status: SkillStatus; tries: number };

export type PreviewSession = {
  date: string; // ISO
  show: string;
  color: string;
  question: string;
  answer: string;
  status: "correct" | "incorrect" | "unclear";
  afterHelp: boolean;
  summary: string;
};

export type PreviewSubject = {
  id: "math" | "english" | "science";
  name: string;
  color: string;
  /** Where the sample child is on the grade path, e.g. Grade 1 skills mostly done, starting Grade 2. */
  gradeFrom: 1;
  gradeTo: 2;
  headline: string;
  skills: PreviewSkill[];
  sessions: PreviewSession[];
};

const DORA = { show: "Dora", color: "#ff5fa2" };
const BLUEY = { show: "Bluey", color: "#5b9cf2" };
const PEPPA = { show: "Peppa", color: "#f08a6b" };
const DANIEL = { show: "Daniel Tiger", color: "#f2c94c" };

export const PREVIEW_CHILD = "Sam";
export const PREVIEW_PERIOD = "Oct 6 – Nov 13, 2026 (sample)";

export const PREVIEW_SUBJECTS: PreviewSubject[] = [
  {
    id: "math",
    name: "Math",
    color: "#2f9e5b",
    gradeFrom: 1,
    gradeTo: 2,
    headline: "Most Grade 1 counting and adding skills answered on the first try; now practicing Grade 2 place value.",
    skills: [
      { name: "Count objects up to 20", grade: 1, status: "first_try", tries: 9 },
      { name: "Add within 10", grade: 1, status: "first_try", tries: 7 },
      { name: "Subtract within 10", grade: 1, status: "after_help", tries: 6 },
      { name: "Compare numbers (more / fewer)", grade: 1, status: "first_try", tries: 5 },
      { name: "Add within 20", grade: 1, status: "after_help", tries: 4 },
      { name: "Tens and ones (place value)", grade: 2, status: "practicing", tries: 3 },
      { name: "Add within 100", grade: 2, status: "practicing", tries: 2 },
      { name: "Tell time to five minutes", grade: 2, status: "up_next", tries: 0 },
    ],
    sessions: [
      { date: "2026-11-12T16:40:00", ...DORA, question: "Boots has 14 bananas and eats 4. How many are left?", answer: "ten", status: "correct", afterHelp: false, summary: "Subtracted within 20 on the first try." },
      { date: "2026-11-09T17:10:00", ...DANIEL, question: "How many tens are in 32?", answer: "two", status: "incorrect", afterHelp: false, summary: "Said two tens for 32; after Daniel grouped the blocks, answered three." },
      { date: "2026-11-02T16:25:00", ...BLUEY, question: "Bingo has 8 stickers and gets 5 more. How many now?", answer: "thirteen", status: "correct", afterHelp: true, summary: "Answered 13 after counting on from 8 with Bluey." },
      { date: "2026-10-20T16:50:00", ...DORA, question: "How many stars are in Dora's backpack?", answer: "seven", status: "correct", afterHelp: false, summary: "Counted 7 stars on the first try." },
      { date: "2026-10-08T17:00:00", ...DORA, question: "Which pile has more apples?", answer: "the big one", status: "correct", afterHelp: false, summary: "Picked the pile with more apples." },
    ],
  },
  {
    id: "english",
    name: "English",
    color: "#7b61ff",
    gradeFrom: 1,
    gradeTo: 2,
    headline: "Rhymes and beginning sounds answered on the first try; practicing Grade 2 vowel teams.",
    skills: [
      { name: "Rhyming words", grade: 1, status: "first_try", tries: 8 },
      { name: "Beginning sounds", grade: 1, status: "first_try", tries: 6 },
      { name: "Short vowel words", grade: 1, status: "after_help", tries: 5 },
      { name: "Retell a story in order", grade: 1, status: "after_help", tries: 3 },
      { name: "Vowel teams (ai, ee, oa)", grade: 2, status: "practicing", tries: 2 },
      { name: "Describe a character's feelings", grade: 2, status: "up_next", tries: 0 },
    ],
    sessions: [
      { date: "2026-11-11T16:30:00", ...PEPPA, question: "What word rhymes with 'muddy'?", answer: "buddy", status: "correct", afterHelp: false, summary: "Found a rhyme on the first try." },
      { date: "2026-11-04T17:20:00", ...BLUEY, question: "What happened first in the game of Keepy Uppy?", answer: "the balloon popped", status: "incorrect", afterHelp: false, summary: "Started at the end of the story; put the events in order after a reminder." },
      { date: "2026-10-27T16:45:00", ...DORA, question: "What sound does 'boat' start with?", answer: "buh", status: "correct", afterHelp: false, summary: "Named the beginning sound /b/." },
    ],
  },
  {
    id: "science",
    name: "Science",
    color: "#e08a00",
    gradeFrom: 1,
    gradeTo: 2,
    headline: "Weather and plant questions answered after help; starting Grade 2 states of matter.",
    skills: [
      { name: "Weather and what to wear", grade: 1, status: "first_try", tries: 5 },
      { name: "What plants need", grade: 1, status: "after_help", tries: 4 },
      { name: "Animal homes", grade: 1, status: "after_help", tries: 3 },
      { name: "Solids and liquids", grade: 2, status: "practicing", tries: 1 },
      { name: "Plant life cycle", grade: 2, status: "up_next", tries: 0 },
    ],
    sessions: [
      { date: "2026-11-10T16:15:00", ...DANIEL, question: "What happens to ice when it gets warm?", answer: "it melts", status: "correct", afterHelp: true, summary: "Said ice melts after Daniel showed the ice cube." },
      { date: "2026-11-03T16:35:00", ...DORA, question: "It's starting to rain! Sunglasses or an umbrella?", answer: "umbrella", status: "correct", afterHelp: false, summary: "Chose the umbrella on the first try." },
      { date: "2026-10-22T17:05:00", ...PEPPA, question: "What do Peppa's plants need to grow?", answer: "toys", status: "incorrect", afterHelp: false, summary: "Said toys; named water and sun after Grandpa Pig's hint." },
    ],
  },
];

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  first_try: "Answered on the first try",
  after_help: "Answered after help",
  practicing: "Practicing",
  up_next: "Up next",
};

/** Share of a grade's listed skills that have been answered (first try or after help). */
export function gradeProgress(subject: PreviewSubject, grade: 1 | 2): { answered: number; total: number } {
  const skills = subject.skills.filter((s) => s.grade === grade);
  return {
    answered: skills.filter((s) => s.status === "first_try" || s.status === "after_help").length,
    total: skills.length,
  };
}
