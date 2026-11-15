// HARD-CODED SAMPLE DATA for the /parent/preview page: how the parent view could look after a few
// weeks of watching. Nothing here comes from a real child or a real session. The page labels it
// as a sample on every section. It never feeds the real counts, live view or insights.
//
// Wording stays within learning-progress-plan.md §3: counts of what happened ("answered on the
// first try", "after help"), never "mastered" or a test score.

export type SkillStatus = "first_try" | "after_help" | "practicing" | "up_next";

export type PreviewSkill = {
  name: string; // short name, as a teacher would say it
  plain: string; // what it means, in words a parent would use
  example: string; // a real-looking moment from a show where the child did it
  grade: 1 | 2;
  status: SkillStatus;
  firstTry: number; // of the last `recent` tries, how many were right on the first try
  recent: number;
};

/** A dated step on the way from Grade 1 to Grade 2. */
export type Milestone = { date: string; text: string; grade: 1 | 2 };

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
  milestones: Milestone[];
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
    headline: "Finished the Grade 1 counting and adding skills and started Grade 2 with tens and ones.",
    skills: [
      { name: "Counting to 20", plain: "Counts a group of things one by one and says how many.", example: "Counted 7 stars in Dora's backpack.", grade: 1, status: "first_try", firstTry: 5, recent: 5 },
      { name: "Adding within 10", plain: "Puts two small groups together and says how many in all.", example: "Bingo had 4 stickers and got 3 more: said 7.", grade: 1, status: "first_try", firstTry: 4, recent: 5 },
      { name: "Taking away within 10", plain: "Says how many are left after some are taken away.", example: "Boots had 6 bananas and ate 2: said 4 after a hint.", grade: 1, status: "after_help", firstTry: 2, recent: 5 },
      { name: "More or fewer", plain: "Looks at two groups and says which has more.", example: "Picked the bigger pile of apples.", grade: 1, status: "first_try", firstTry: 5, recent: 5 },
      { name: "Adding within 20", plain: "Adds numbers that go past 10, like 8 + 5.", example: "Bluey had 8 stickers and got 5 more: said 13 after counting on.", grade: 1, status: "after_help", firstTry: 2, recent: 4 },
      { name: "Tens and ones", plain: "Knows that 32 means 3 groups of ten and 2 extra.", example: "Said 2 tens for 32 at first, then 3 after Daniel grouped the blocks.", grade: 2, status: "practicing", firstTry: 1, recent: 3 },
      { name: "Adding within 100", plain: "Adds bigger numbers, like 23 + 10.", example: "Just started: 1 try so far.", grade: 2, status: "practicing", firstTry: 0, recent: 2 },
      { name: "Telling time", plain: "Reads a clock to the nearest five minutes.", example: "Not tried yet.", grade: 2, status: "up_next", firstTry: 0, recent: 0 },
    ],
    milestones: [
      { date: "2026-10-08T17:00:00", text: "Counted groups up to 20 on the first try", grade: 1 },
      { date: "2026-10-20T16:50:00", text: "Started adding within 10 without fingers", grade: 1 },
      { date: "2026-11-02T16:25:00", text: "Added past 10 (8 + 5) with a little help", grade: 1 },
      { date: "2026-11-09T17:10:00", text: "Started Grade 2: tens and ones", grade: 2 },
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
      { name: "Rhyming words", plain: "Hears words that sound alike at the end, like cat and hat.", example: "Said buddy rhymes with muddy.", grade: 1, status: "first_try", firstTry: 5, recent: 5 },
      { name: "First sounds", plain: "Says the sound a word starts with.", example: "Said boat starts with /b/.", grade: 1, status: "first_try", firstTry: 4, recent: 4 },
      { name: "Short vowel words", plain: "Reads simple words like sit, cat, hop.", example: "Read hop after Peppa sounded it out.", grade: 1, status: "after_help", firstTry: 2, recent: 4 },
      { name: "Retelling a story", plain: "Tells what happened first, next and last.", example: "Put the Keepy Uppy story in order after a reminder.", grade: 1, status: "after_help", firstTry: 1, recent: 3 },
      { name: "Vowel teams", plain: "Reads two letters that make one sound, like ai in rain.", example: "Read rain with help; 2 tries so far.", grade: 2, status: "practicing", firstTry: 0, recent: 2 },
      { name: "Characters' feelings", plain: "Says how a character feels and why.", example: "Not tried yet.", grade: 2, status: "up_next", firstTry: 0, recent: 0 },
    ],
    milestones: [
      { date: "2026-10-14T16:40:00", text: "Found rhymes on the first try", grade: 1 },
      { date: "2026-10-27T16:45:00", text: "Named first sounds of new words", grade: 1 },
      { date: "2026-11-04T17:20:00", text: "Retold a story in order with a reminder", grade: 1 },
      { date: "2026-11-11T16:30:00", text: "Started Grade 2: vowel teams", grade: 2 },
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
      { name: "Weather", plain: "Knows what to wear or bring for rain, sun or snow.", example: "Picked the umbrella when it started to rain.", grade: 1, status: "first_try", firstTry: 4, recent: 4 },
      { name: "What plants need", plain: "Knows plants need water and sunlight to grow.", example: "Said toys at first, then water and sun after Grandpa Pig's hint.", grade: 1, status: "after_help", firstTry: 1, recent: 3 },
      { name: "Animal homes", plain: "Matches animals to where they live.", example: "Said fish live in the pond after a clue.", grade: 1, status: "after_help", firstTry: 1, recent: 3 },
      { name: "Solids and liquids", plain: "Knows ice melts into water when it gets warm.", example: "Said ice melts after Daniel showed the ice cube.", grade: 2, status: "practicing", firstTry: 0, recent: 1 },
      { name: "Plant life cycle", plain: "Knows seeds grow into plants that make new seeds.", example: "Not tried yet.", grade: 2, status: "up_next", firstTry: 0, recent: 0 },
    ],
    milestones: [
      { date: "2026-10-22T17:05:00", text: "Started talking about what plants need", grade: 1 },
      { date: "2026-11-03T16:35:00", text: "Matched weather to what to wear on the first try", grade: 1 },
      { date: "2026-11-10T16:15:00", text: "Started Grade 2: solids and liquids", grade: 2 },
    ],
    sessions: [
      { date: "2026-11-10T16:15:00", ...DANIEL, question: "What happens to ice when it gets warm?", answer: "it melts", status: "correct", afterHelp: true, summary: "Said ice melts after Daniel showed the ice cube." },
      { date: "2026-11-03T16:35:00", ...DORA, question: "It's starting to rain! Sunglasses or an umbrella?", answer: "umbrella", status: "correct", afterHelp: false, summary: "Chose the umbrella on the first try." },
      { date: "2026-10-22T17:05:00", ...PEPPA, question: "What do Peppa's plants need to grow?", answer: "toys", status: "incorrect", afterHelp: false, summary: "Said toys; named water and sun after Grandpa Pig's hint." },
    ],
  },
];

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  first_try: "Gets it on the first try",
  after_help: "Gets it with a little help",
  practicing: "Working on it now",
  up_next: "Coming up next",
};

/** One plain sentence: where the child is on the grade path right now. */
export function whereNow(subject: PreviewSubject, child: string): string {
  const g1 = subject.skills.filter((k) => k.grade === 1);
  const g2 = subject.skills.filter((k) => k.grade === 2);
  const g1Done = g1.filter((k) => k.status === "first_try" || k.status === "after_help").length;
  const g2Started = g2.filter((k) => k.status !== "up_next").length;
  if (g1Done < g1.length) return `${child} is working through Grade 1: ${g1Done} of ${g1.length} skills done so far.`;
  return `${child} has done all ${g1.length} Grade 1 skills and has started ${g2Started} of ${g2.length} Grade 2 skills.`;
}

/** The skill the child is on now: the first one that isn't done yet. */
export function currentSkill(subject: PreviewSubject): PreviewSkill | undefined {
  return subject.skills.find((k) => k.status === "practicing") ?? subject.skills.find((k) => k.status === "up_next");
}

/** Share of a grade's listed skills that have been answered (first try or after help). */
export function gradeProgress(subject: PreviewSubject, grade: 1 | 2): { answered: number; total: number } {
  const skills = subject.skills.filter((s) => s.grade === grade);
  return {
    answered: skills.filter((s) => s.status === "first_try" || s.status === "after_help").length,
    total: skills.length,
  };
}
