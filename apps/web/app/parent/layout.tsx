import type { Metadata } from "next";
import { hasParentAccess } from "../../lib/parent/access";
import { AccessForm } from "./_components/access-form";

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parent view" };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const allowed = await hasParentAccess();
  return (
    <div className="parent-theme min-h-screen bg-background font-sans text-foreground">
      <main className="mx-auto max-w-[820px] space-y-7 px-6 py-12">
        {allowed ? children : <AccessForm />}
      </main>
    </div>
  );
}
