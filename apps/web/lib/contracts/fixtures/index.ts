import type {
  CreateSessionRequest,
  CreateSessionResponse,
  TurnRequestMetadata,
  TurnResponse,
} from "../turn";
import type { SessionProgress } from "../progress";
import type { SessionUpdatedEvent } from "../realtime";

// Deliberately synthetic; never microphone recordings or real learner data.
export const sessionId = "11111111-1111-4111-8111-111111111111";
export const originalInteractionId = "22222222-2222-4222-8222-222222222222";
export const variantQuestionId = "33333333-3333-4333-8333-333333333333";
export const variantInteractionId = "44444444-4444-4444-8444-444444444444";
export const initialQuestion = {
  questionId: "prepared-question-1",
  text: "How many red apples are on the table?",
};
export const variantQuestion = {
  questionId: variantQuestionId,
  text: "How many green apples are on the plate?",
};
export const createSessionRequest = {
  sceneId: "demo-scene",
} satisfies CreateSessionRequest;
export const createSessionResponse = {
  sessionId,
  turnNumber: 0,
  question: initialQuestion,
} satisfies CreateSessionResponse;
export const turnRequestMetadata = {
  interactionId: originalInteractionId,
  questionId: initialQuestion.questionId,
  expectedTurnNumber: 0,
} satisfies TurnRequestMetadata;
export const incorrectOriginalResponse = {
  sessionId,
  interactionId: originalInteractionId,
  turnNumber: 1,
  response: {
    type: "teaching",
    text: "There are three red apples. Let's count another set. How many green apples are on the plate?",
    nextQuestion: variantQuestion,
  },
  assessment: {
    answerStatus: "incorrect",
    evidence: "Said two for the three red apples.",
    possibleMisconception: "May have missed an apple while counting.",
    assistanceBeforeAnswer: false,
  },
} satisfies TurnResponse;
export const correctVariantResponse = {
  sessionId,
  interactionId: variantInteractionId,
  turnNumber: 2,
  response: {
    type: "teaching",
    text: "Yes, there are two green apples!",
    nextQuestion: null,
  },
  assessment: {
    answerStatus: "correct",
    evidence: "Counted the green apples as two.",
    possibleMisconception: null,
    assistanceBeforeAnswer: true,
  },
} satisfies TurnResponse;
export const pendingProgress = {
  sessionId,
  objective: "Count a small set of apples.",
  activeQuestion: variantQuestion,
  interactions: [
    {
      interactionId: originalInteractionId,
      turnNumber: 1,
      questionId: initialQuestion.questionId,
      questionText: initialQuestion.text,
      transcript: "Two.",
      responseText: incorrectOriginalResponse.response.text,
      responseType: "teaching",
      assessment: incorrectOriginalResponse.assessment,
      assistanceInResponse: true,
    },
  ],
  episode: {
    turns: 1,
    responsesWithAssistance: 1,
    finalStatus: "incorrect",
    parentSummary:
      "Counted the red apples as two; a different counting question is pending.",
  },
} satisfies SessionProgress;
export const terminalProgress = {
  ...pendingProgress,
  activeQuestion: null,
  interactions: [
    ...pendingProgress.interactions,
    {
      interactionId: variantInteractionId,
      turnNumber: 2,
      questionId: variantQuestionId,
      questionText: variantQuestion.text,
      transcript: "Two.",
      responseText: correctVariantResponse.response.text,
      responseType: "teaching",
      assessment: correctVariantResponse.assessment,
      assistanceInResponse: false,
    },
  ],
  episode: {
    turns: 2,
    responsesWithAssistance: 1,
    finalStatus: "correct",
    parentSummary:
      "Answered the variant correctly after assistance was supplied.",
  },
} satisfies SessionProgress;
export const sessionUpdatedEvent = {
  sessionId,
  interactionId: originalInteractionId,
  turnNumber: 1,
} satisfies SessionUpdatedEvent;
