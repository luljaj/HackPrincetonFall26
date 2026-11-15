import { afterEach, beforeEach, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => jar.has(key) ? { value: jar.get(key)! } : undefined,
    set: (key: string, value: string) => jar.set(key, value),
  }),
}));

import { childName, CHILD_NAME_COOKIE } from "./child";
import { saveStudentName } from "../../app/parent/settings/student-name-action";

const initial = { error: "", saved: false };
const form = (name: string) => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

beforeEach(() => {
  jar.clear();
  vi.stubEnv("PARENT_ACCESS_CODE", "");
  vi.stubEnv("PARENT_CHILD_NAME", "");
});
afterEach(() => vi.unstubAllEnvs());

it("uses the configured default until a trimmed Unicode name is saved", async () => {
  expect(await childName()).toBe("Sam");
  vi.stubEnv("PARENT_CHILD_NAME", "Alex");
  expect(await childName()).toBe("Alex");
  expect(await saveStudentName(initial, form("  Zoë 李  "))).toEqual({ error: "", saved: true });
  expect(await childName()).toBe("Zoë 李");
});

it("keeps the saved name when input is blank or too long", async () => {
  jar.set(CHILD_NAME_COOKIE, "Alex");
  for (const value of ["   ", "x".repeat(41)]) {
    expect((await saveStudentName(initial, form(value))).saved).toBe(false);
    expect(await childName()).toBe("Alex");
  }
});

it("requires parent access when the gate is enabled", async () => {
  vi.stubEnv("PARENT_ACCESS_CODE", "test-code");
  expect((await saveStudentName(initial, form("Alex"))).saved).toBe(false);
  expect(jar.has(CHILD_NAME_COOKIE)).toBe(false);
  jar.set("parent_access", "test-code");
  expect((await saveStudentName(initial, form("Alex"))).saved).toBe(true);
});
