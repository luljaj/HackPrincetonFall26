import { SceneConfigSchema } from "../../lib/contracts/scene";

// Synthetic development fixture, not the authored demo objective.
export const exampleScene = SceneConfigSchema.parse({
  sceneId: "demo-scene",
  objectiveId: "count-small-sets",
  objective: "Count a small set of apples.",
  sceneFacts: [
    "Three red apples sit on the table.",
    "Two green apples sit on a separate plate.",
  ],
  transcriptionHints: ["three", "two", "apples"],
  character: { name: "Pip", speakingStyle: "Warm, short sentences." },
  learnerDescription: null,
  initialQuestion: {
    questionId: "prepared-question-1",
    text: "How many red apples are on the table?",
    answerGuide: "Three; accept 3 or three apples.",
  },
  assistanceAlreadyProvided: false,
});
