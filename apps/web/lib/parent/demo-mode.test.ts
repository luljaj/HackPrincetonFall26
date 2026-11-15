import { describe, expect, it } from "vitest";
import { demoAnswer, demoCommand, DEMO_START_FOCUS, isDemoPrompt } from "./demo-mode";
import { FocusSchema } from "./preferences";

describe("demo mode", () => {
  it("uses direct language and reset commands, while leaving ambiguity to the model", () => {
    expect(demoCommand("Switch Sam to Spanish")).toEqual({ name: "set_language", arguments: '{"language":"es"}' });
    expect(demoCommand("teach him hindi now")).toEqual({ name: "set_language", arguments: '{"language":"hi"}' });
    expect(demoCommand("Reset Sam on counting")?.name).toBe("reset_skill");
    expect(demoCommand("Start him over on the topic he's on")?.arguments).toContain('"current":true');
    expect(demoCommand("Don't switch Sam to Spanish")).toBeUndefined();
    expect(demoCommand("Reset numbers and shapes")).toBeUndefined();
    expect(demoCommand("Teach more addition in Spanish")).toBeUndefined();
    expect(isDemoPrompt("Don't give him more addition")).toBe(false);
    expect(isDemoPrompt("More addition in Spanish")).toBe(false);
  });
  it("answers the rehearsed prompt with a focus the server accepts", () => {
    expect(isDemoPrompt("Make Sam learn more about addition!")).toBe(true);
    const { after } = demoAnswer("Sam", DEMO_START_FOCUS);
    expect(FocusSchema.safeParse(after).success).toBe(true); // the save rejects unknown categories
    expect(after.numbers).toBe("more");
    expect(demoAnswer("Sam", after).reply).toContain("already turned up");
  });
});
