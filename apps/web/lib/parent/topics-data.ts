// HARD-CODED SAMPLE DATA for /parent/topics: topic-by-topic view for the demo (Shapes, Numbers,
// Objects). Nothing here comes from a real child or session; every page labels it "Sample".
// Wording follows learning-progress-plan.md §3: what happened and how often, never "mastered".

export type TopicLevel = "exploring" | "practicing" | "comfortable";

export const TOPIC_LEVEL: Record<TopicLevel, { label: string; step: 1 | 2 | 3; note: string }> = {
  exploring: { label: "Exploring", step: 1, note: "Just started; mostly answered after help." },
  practicing: { label: "Practicing", step: 2, note: "Answering more on the first try, still needs help sometimes." },
  comfortable: { label: "Comfortable", step: 3, note: "Usually answered on the first try lately." },
};

export type Video = { show: string; color: string; episode: string; moment: string };

export type LearnedItem = {
  skill: string;
  date: string; // ISO
  howAnswered: "first_try" | "after_help";
  video: Video;
};

export type MissedQuestion = {
  question: string;
  answered: string;
  expected: string;
  date: string;
  video: Video;
  gotItAfterHelp: boolean;
};

export type Topic = {
  id: "shapes" | "numbers" | "objects";
  name: string;
  color: string;
  level: TopicLevel;
  summary: string;
  questionsAsked: number;
  firstTry: number;
  afterHelp: number;
  gettingBetterAt: string[];
  needsPractice: string[];
  learned: LearnedItem[];
  missed: MissedQuestion[];
  plan: { outcomes: string[]; nextUp: { activity: string; video: Video }[] };
};

const dora = (episode: string, moment: string): Video => ({ show: "Dora", color: "#ff5fa2", episode, moment });
const bluey = (episode: string, moment: string): Video => ({ show: "Bluey", color: "#5b9cf2", episode, moment });
const peppa = (episode: string, moment: string): Video => ({ show: "Peppa", color: "#f08a6b", episode, moment });
const daniel = (episode: string, moment: string): Video => ({ show: "Daniel Tiger", color: "#d9a400", episode, moment });

export const TOPICS_PERIOD = "Oct 20 – Nov 13, 2026 (sample)";

export const TOPICS: Topic[] = [
  {
    id: "numbers",
    name: "Numbers",
    color: "#2f9e5b",
    level: "comfortable",
    summary: "Counting small groups is usually right on the first try; adding within 10 is coming along.",
    questionsAsked: 14,
    firstTry: 10,
    afterHelp: 3,
    gettingBetterAt: ["Counting up to 10 objects", "Saying which group has more"],
    needsPractice: ["Adding within 10 without counting on fingers"],
    learned: [
      { skill: "Counted 3 red apples", date: "2026-11-13T16:30:00", howAnswered: "first_try", video: dora("Episode 3 · When I Grow Up", "Apple stand, 4:12") },
      { skill: "Counted 7 stars in the backpack", date: "2026-11-06T16:50:00", howAnswered: "first_try", video: dora("Episode 1 · Star Catcher", "Backpack song, 9:40") },
      { skill: "Picked the bigger pile of blocks", date: "2026-10-29T17:05:00", howAnswered: "first_try", video: daniel("Block Tower Day", "Tower building, 3:05") },
      { skill: "Added 4 + 3 stickers", date: "2026-10-24T16:20:00", howAnswered: "after_help", video: bluey("Sticker Swap", "Bingo's sticker book, 2:18") },
    ],
    missed: [
      { question: "How many red apples are on the table?", answered: "five", expected: "three", date: "2026-11-13T16:29:00", video: dora("Episode 3 · When I Grow Up", "Apple stand, 4:12"), gotItAfterHelp: true },
      { question: "Bingo has 4 stickers and gets 3 more. How many now?", answered: "six", expected: "seven", date: "2026-10-24T16:19:00", video: bluey("Sticker Swap", "Bingo's sticker book, 2:18"), gotItAfterHelp: true },
    ],
    plan: {
      outcomes: ["Add within 10 by counting on from the bigger number", "Count up to 20 objects in a row"],
      nextUp: [
        { activity: "Counting on: 'Start at 5, then 6, 7…'", video: bluey("Shops", "Counting coins, 5:30") },
        { activity: "Count to 20 with the Fiesta Trio", video: dora("Episode 2 · Fiesta Trio", "Bridge count, 7:45") },
      ],
    },
  },
  {
    id: "shapes",
    name: "Shapes",
    color: "#7b61ff",
    level: "practicing",
    summary: "Circles and squares are easy; triangles and rectangles still get mixed up.",
    questionsAsked: 9,
    firstTry: 5,
    afterHelp: 3,
    gettingBetterAt: ["Spotting circles in everyday things", "Telling squares from circles"],
    needsPractice: ["Triangle vs. rectangle", "Counting a shape's sides"],
    learned: [
      { skill: "Found the circle-shaped clock", date: "2026-11-11T16:40:00", howAnswered: "first_try", video: peppa("Grandpa's Clock", "Clock shop, 1:52") },
      { skill: "Named the square window", date: "2026-11-04T17:10:00", howAnswered: "first_try", video: daniel("Shape Hunt", "Neighborhood walk, 6:20") },
      { skill: "Found the triangle on the map", date: "2026-10-30T16:15:00", howAnswered: "after_help", video: dora("Episode 4 · Map's Maze", "Map song, 2:40") },
    ],
    missed: [
      { question: "Which sign is a triangle?", answered: "the long one", expected: "the yield sign", date: "2026-11-08T16:25:00", video: daniel("Shape Hunt", "Street signs, 8:05"), gotItAfterHelp: true },
      { question: "How many sides does the rectangle door have?", answered: "three", expected: "four", date: "2026-11-02T16:45:00", video: bluey("Fairies", "Garden door, 4:30"), gotItAfterHelp: false },
    ],
    plan: {
      outcomes: ["Tell triangles and rectangles apart", "Count the sides of a shape"],
      nextUp: [
        { activity: "Shape hunt: count the sides out loud", video: daniel("Shape Hunt", "Street signs, 8:05") },
        { activity: "Find triangles on Map's route", video: dora("Episode 4 · Map's Maze", "Map song, 2:40") },
      ],
    },
  },
  {
    id: "objects",
    name: "Objects",
    color: "#e08a00",
    level: "exploring",
    summary: "Naming everyday objects is going well; sorting them into groups is new.",
    questionsAsked: 7,
    firstTry: 3,
    afterHelp: 3,
    gettingBetterAt: ["Naming things you'd pack for a trip"],
    needsPractice: ["Sorting objects by what they're used for", "Which object doesn't belong"],
    learned: [
      { skill: "Picked the umbrella for the rain", date: "2026-11-10T16:35:00", howAnswered: "first_try", video: dora("Episode 1 · Star Catcher", "Rain cloud, 11:02") },
      { skill: "Named the seatbelt", date: "2026-11-05T16:55:00", howAnswered: "after_help", video: dora("Episode 3 · When I Grow Up", "Car ride, 6:48") },
      { skill: "Sorted toys from food", date: "2026-10-27T17:00:00", howAnswered: "after_help", video: peppa("Picnic", "Picnic basket, 3:15") },
    ],
    missed: [
      { question: "Which one doesn't belong: spoon, fork, or ball?", answered: "fork", expected: "ball", date: "2026-11-09T17:15:00", video: peppa("Picnic", "Picnic basket, 3:15"), gotItAfterHelp: true },
      { question: "What do we use to brush our teeth?", answered: "a comb", expected: "a toothbrush", date: "2026-10-31T16:30:00", video: daniel("Bedtime", "Bathroom routine, 2:10"), gotItAfterHelp: true },
    ],
    plan: {
      outcomes: ["Sort objects by what they're used for", "Spot the one that doesn't belong"],
      nextUp: [
        { activity: "Pack the backpack: what goes, what stays?", video: dora("Episode 1 · Star Catcher", "Backpack song, 9:40") },
        { activity: "Picnic sort: food, plates, toys", video: peppa("Picnic", "Picnic basket, 3:15") },
      ],
    },
  },
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/** Basic stats across all sample topics. */
export function topicTotals(topics: readonly Topic[] = TOPICS) {
  const missed = topics.flatMap((t) => t.missed);
  return {
    asked: topics.reduce((n, t) => n + t.questionsAsked, 0),
    firstTry: topics.reduce((n, t) => n + t.firstTry, 0),
    afterHelp: topics.reduce((n, t) => n + t.afterHelp, 0),
    missed: missed.length,
    missedThenGotIt: missed.filter((m) => m.gotItAfterHelp).length,
  };
}
