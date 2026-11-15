import { hasParentAccess } from "../../../../lib/parent/access";
import { CATEGORIES } from "../../../../lib/play/mastery";
import { LanguageCodeSchema } from "../../../../lib/play/language-lessons";
import { learningAnalysis } from "../../../../server/learning/analysis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const subject = new URL(request.url).searchParams.get("subject") ?? "";
  if (!CATEGORIES.some(c => c.id === subject) && !(subject.startsWith("language:") && LanguageCodeSchema.safeParse(subject.slice(9)).success)) return Response.json({ error: "Choose a curriculum subject." }, { status: 400 });
  try { return Response.json(await learningAnalysis(subject), { headers: { "Cache-Control": "no-store" } }); }
  catch {
    return Response.json({ error: "Luna couldn't analyze the saved evidence right now." }, { status: 503 });
  }
}
