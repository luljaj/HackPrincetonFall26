import { notFound } from "next/navigation";
import { debugEnabled } from "../../../server/pipeline/runtime-core";
import PipelineInspector from "./inspector";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function PipelinePage() {
  if (!debugEnabled(process.env)) notFound();
  return <PipelineInspector />;
}
