import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Lexend, Sora } from "next/font/google";
import { hasParentAccess } from "../../lib/parent/access";
import { demoToolsEnabled } from "../../lib/parent/demo";
import { AccessForm } from "./_components/access-form";
import { SideNav } from "./_components/side-nav";
import { ChatPanel } from "./_components/chat-panel";
import { childName } from "../../lib/parent/child";
import "./parent.css";

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });

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
    <div className={`${sora.variable} ${lexend.variable} parent-theme min-h-screen bg-background font-sans text-foreground`}>
      <div className="parent-shell">
        <aside className="parent-sidebar">
          <div className="parent-wordmark">
            <Image
              src="/tellavision-wordmark.svg"
              alt="tellavision"
              width={285}
              height={82}
              unoptimized
            />
          </div>
          {allowed && <SideNav items={nav} />}
        </aside>
        <main className="parent-main">{allowed ? children : <AccessForm />}</main>
      </div>
      {allowed && <>
        <button type="button" className="parent-profile-trigger" popoverTarget="parent-profile-menu" aria-label="Switch profile">
          <span className="parent-profile-avatar" aria-hidden="true">P</span>
          <span>Parent</span><span aria-hidden="true">⌄</span>
        </button>
        <div popover="auto" id="parent-profile-menu" className="parent-profile-menu" aria-label="Profiles">
          <p>Switch profile</p>
          <div className="parent-profile-current"><span className="parent-profile-avatar" aria-hidden="true">P</span><span>Parent view<small>Current profile</small></span><span aria-hidden="true">✓</span></div>
          <Link href="/"><span className="parent-child-avatar" aria-hidden="true">{childName().slice(0, 1)}</span><span>{childName()}<small>Kid mode · watch the cartoon</small></span><span aria-hidden="true">↗</span></Link>
        </div>
      </>}
      {allowed && <ChatPanel child={childName()} />}
    </div>
  );
}
