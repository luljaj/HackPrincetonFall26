import { pipelineHandlers } from "../../../../../../server/pipeline/routes";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return pipelineHandlers.turn(request, (await context.params).sessionId);
}
