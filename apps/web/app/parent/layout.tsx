import type { Metadata } from "next";
import { Lexend, Sora } from "next/font/google";
import { hasParentAccess } from "../../lib/parent/access";
import { AccessForm } from "./_components/access-form";
import { ParentHeader } from "./_components/parent-header";

const sora = Sora({ subsets: ["latin"], weight: "700", variable: "--font-sora" });
const lexend = Lexend({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-lexend-face" });

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parent view" };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const allowed = await hasParentAccess();
  return (
    <div
      className={`${sora.variable} ${lexend.variable} parent-theme min-h-dvh bg-background font-lexend text-sm leading-[1.35] font-medium text-foreground`}
    >
      {/* Every parent page shares this shell. The home page (.tv-home) also fills exactly one screen on desktop. */}
      <main className="mx-auto flex min-h-dvh max-w-[1280px] flex-col gap-4 px-10 py-6 lg:has-[.tv-home]:h-dvh">
        <ParentHeader showNav={allowed} />
        {allowed ? children : <AccessForm />}
      </main>
    </div>
  );
}
