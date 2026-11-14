import "server-only";
import { createHttpHandlers } from "./http";
import { getPipelineRuntime } from "./runtime";
export const pipelineHandlers = createHttpHandlers(getPipelineRuntime, process.env);
