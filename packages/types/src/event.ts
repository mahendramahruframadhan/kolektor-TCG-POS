import { z } from "zod";

export const EventStatusSchema = z.enum(["draft", "active", "closed"]);

export const CreateEventSchema = z.object({
  name: z.string().min(1),
  venue: z.string().default(""),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: EventStatusSchema.default("draft"),
});

export const UpdateEventSchema = z.object({
  name: z.string().min(1).optional(),
  venue: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: EventStatusSchema.optional(),
  version: z.number().int().positive(),
});

export type CreateEvent = z.infer<typeof CreateEventSchema>;
export type UpdateEvent = z.infer<typeof UpdateEventSchema>;
