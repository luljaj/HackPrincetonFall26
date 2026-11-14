import type { Metadata } from "next";
import { hasParentAccess } from "../../lib/parent/access";
import { AccessForm } from "./_components/access-form";

// Access is checked per request, so never prerender this tree.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parent dashboard" };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const allowed = await hasParentAccess();
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 bg-background px-4 py-8 font-sans text-foreground">
      {allowed ? children : <AccessForm />}
    </main>
  );
}
