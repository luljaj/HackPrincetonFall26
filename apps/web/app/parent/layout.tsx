import type { Metadata } from "next";
import { Lexend, Sora } from "next/font/google";
import { hasParentAccess } from "../../lib/parent/access";
import { AccessForm } from "./_components/access-form";

const sora = Sora({ subsets: ["latin"], weight: "700", variable: "--font-sora" });
const lexend = Lexend({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-lexend-face" });

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parent view" };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const allowed = await hasParentAccess();
  return (
    <div
      className={`${sora.variable} ${lexend.variable} parent-theme min-h-screen bg-background font-sans text-foreground has-[.tv-home]:bg-tv-page has-[.tv-home]:text-black`}
    >
      {/* The home page (.tv-home) uses the wide Tellavision layout and, on desktop, fills exactly one screen; other parent pages keep the narrow column. */}
      <main className="mx-auto max-w-[820px] space-y-7 px-6 py-12 has-[.tv-home]:max-w-[1280px] has-[.tv-home]:px-10 has-[.tv-home]:py-6">
        {allowed ? children : <AccessForm />}
      </main>
    </div>
  );
}
