// Demo tools (reset) are off unless DEMO_TOOLS=true, and never on in production builds
// unless explicitly enabled. They delete every non-sample session.
export function demoToolsEnabled(): boolean {
  return process.env.DEMO_TOOLS === "true";
}
