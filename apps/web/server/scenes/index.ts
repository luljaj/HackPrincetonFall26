import "server-only";
import {
  AuthoredIdSchema,
  SceneConfigSchema,
  type SceneConfig,
} from "../../lib/contracts/scene";
import { exampleScene } from "./example.scene";

const scenes = new Map<string, SceneConfig>([
  [exampleScene.sceneId, exampleScene],
]);

export function getScene(sceneId: string): SceneConfig | null {
  const scene = scenes.get(AuthoredIdSchema.parse(sceneId));
  // Parse returns a fresh validated snapshot, insulated from later caller mutations.
  return scene ? SceneConfigSchema.parse(scene) : null;
}
