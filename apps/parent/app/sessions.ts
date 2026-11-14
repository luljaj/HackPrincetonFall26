// Sample data shaped like the pipeline's saved interaction records
// (model-pipeline-implementation-plan.md §3, §9). Replace with the real store's read API.
export type AnswerStatus = "correct" | "incorrect" | "unclear" | "off_topic" | "not_assessed";

export type Interaction = {
  turn: number;
  question: string;
  transcript: string;
  response: string;
  status: AnswerStatus;
  assistanceBefore: boolean;
};

export type Session = {
  id: string;
  show: string;
  color: string;
  episode: string;
  startedAt: string;
  parentSummary: string | null;
  interactions: Interaction[];
};

export const CHILD = "Sam";

export const SESSIONS: Session[] = [
  {
    id: "s3",
    show: "Dora",
    color: "#ff5fa2",
    episode: "Episode 1",
    startedAt: "2026-11-14T16:20:00",
    parentSummary: "Picked candy at first, then chose the banana after Dora explained it's almost bedtime.",
    interactions: [
      {
        turn: 1,
        question: "It's almost bedtime and Boots is hungry. Banana or candy?",
        transcript: "candy!",
        response: "Candy is yummy, but sugar before bed can keep Boots awake. Which snack helps him sleep?",
        status: "incorrect",
        assistanceBefore: false,
      },
      {
        turn: 2,
        question: "Which snack helps him sleep?",
        transcript: "the banana",
        response: "Yes! A banana is a great bedtime snack. Boots says gracias!",
        status: "correct",
        assistanceBefore: true,
      },
    ],
  },
  {
    id: "s2",
    show: "Dora",
    color: "#ff5fa2",
    episode: "Episode 1",
    startedAt: "2026-11-13T17:05:00",
    parentSummary: "Answered the umbrella question correctly on the first try.",
    interactions: [
      {
        turn: 1,
        question: "It's starting to rain! Sunglasses or an umbrella?",
        transcript: "umbrella",
        response: "You got it! The umbrella keeps us dry. ¡Vámonos!",
        status: "correct",
        assistanceBefore: false,
      },
    ],
  },
  {
    id: "s1",
    show: "Dora",
    color: "#ff5fa2",
    episode: "Episode 1",
    startedAt: "2026-11-12T16:45:00",
    parentSummary: null,
    interactions: [
      {
        turn: 1,
        question: "We just played in the mud. What should we do before we eat?",
        transcript: "",
        response: "I didn't catch that. What should we do before we eat?",
        status: "not_assessed",
        assistanceBefore: false,
      },
    ],
  },
];
