import type { Metadata } from "next";
import { hasParentAccess } from "../../lib/parent/access";
import { demoToolsEnabled } from "../../lib/parent/demo";
import { AccessForm } from "./_components/access-form";
import { SideNav } from "./_components/side-nav";
import { ChatPanel } from "./_components/chat-panel";
import { childName } from "../../lib/parent/child";

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tellavision · Parent view" };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const allowed = await hasParentAccess();
  // One scrolling page (/parent): each item is a section on it.
  const nav = [
    { label: "Home", section: "home" },
    { label: "Insights", section: demoToolsEnabled() ? "insights" : null },
    { label: "Mastery", section: "mastery" },
    { label: "Roadmap", section: "roadmap" },
    { label: "Settings", section: "settings" },
  ];
  return (
    <div className="parent-theme min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-8 pt-10 pb-36 md:grid-cols-[240px_1fr]">
        <aside className="space-y-16 md:sticky md:top-10 md:self-start">
          <p className="pl-1 text-[24px] font-semibold tracking-tight">tellavision</p>
          {allowed && <SideNav items={nav} />}
        </aside>
        <main className="min-w-0 space-y-8 md:pt-14">{allowed ? children : <AccessForm />}</main>
      </div>
      {allowed && <ChatPanel child={childName()} />}
    </div>
  );
}
