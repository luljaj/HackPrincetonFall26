import { hasParentAccess } from "../../../../lib/parent/access";
import { LanguageCodeSchema, LessonKeySchema, LessonWriteSchema } from "../../../../lib/play/language-lessons";
import { getLanguageLessonStore } from "../../../../server/storage";
import { LessonConflict } from "../../../../server/storage/language-lessons";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = LanguageCodeSchema.safeParse(new URL(request.url).searchParams.get("language"));
  if (!parsed.success) return Response.json({ error: "Choose a supported language." }, { status: 400 });
  return Response.json({ lessons: await getLanguageLessonStore().list(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
}
async function save(request: Request, createOnly: boolean) {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = LessonWriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a prepared lesson and a level from 0 to 3, or its active state." }, { status: 400 });
  try {
    const lesson = await getLanguageLessonStore().write(parsed.data, createOnly);
    return Response.json({ lesson }, { status: createOnly ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof LessonConflict ? "Progress already exists. Edit it instead." : "The lesson change couldn't be saved." }, { status: error instanceof LessonConflict ? 409 : 500 });
  }
}
export const POST = (request: Request) => save(request, true);
export const PATCH = (request: Request) => save(request, false);
export async function DELETE(request: Request) {
  if (!(await hasParentAccess())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = LessonKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a prepared lesson and language." }, { status: 400 });
  await getLanguageLessonStore().deleteOverride(parsed.data.language, parsed.data.lessonId);
  return Response.json({ lessons: await getLanguageLessonStore().list(parsed.data.language) });
}
