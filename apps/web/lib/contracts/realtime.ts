import { z } from "zod";
import { UuidSchema } from "./scene";

export const SessionUpdatedEventSchema = z.strictObject({
  sessionId: UuidSchema,
  interactionId: UuidSchema,
  turnNumber: z.number().int().positive(),
});
export type SessionUpdatedEvent = z.infer<typeof SessionUpdatedEventSchema>;
