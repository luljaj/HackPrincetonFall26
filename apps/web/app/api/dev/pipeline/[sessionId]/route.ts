import { pipelineHandlers } from "../../../../../server/pipeline/routes";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return pipelineHandlers.debug(request, (await context.params).sessionId);
}
