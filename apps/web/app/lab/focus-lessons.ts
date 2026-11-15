// Prepared additions for the demo: hypothetical stars, so the frozen scene needn't show a particular count.
export const ADDITION_LESSONS = [
  { id: "demo-addition-1", line: "addition1", question: "Let's add! Two stars and one more star. How many stars is that?", answer: "three", accept: ["three", "3", "three stars"] },
  { id: "demo-addition-2", line: "addition2", question: "Let's add! Three stars and one more star. How many stars is that?", answer: "four", accept: ["four", "4", "four stars"] },
  { id: "demo-addition-3", line: "addition3", question: "Let's add! Three stars and two more stars. How many stars is that?", answer: "five", accept: ["five", "5", "five stars"] },
] as const;

export const additionLesson = (index: number, context: "stars" | "keys" = "stars") => {
  const lesson = ADDITION_LESSONS[index % ADDITION_LESSONS.length] ?? ADDITION_LESSONS[0];
  return context === "keys" ? { ...lesson, line: `demoKeysAddition${index % ADDITION_LESSONS.length + 1}`, question: lesson.question.replaceAll("stars", "keys").replaceAll("star", "key"), accept: [...lesson.accept, lesson.answer + " keys"] } : lesson;
};
export const wantsAddition = (before: string | undefined, after: string | undefined) => before !== "more" && after === "more";
