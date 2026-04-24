import { z } from "zod";

/**
 * Standard `?limit=&offset=` query-string parser for list endpoints.
 * Defaults keep every existing caller working: limit = 1000 (full-list
 * behaviour); clamp to 5000 to avoid accidental OOM.
 */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(5000).optional().default(1000),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export function parsePagination(query: unknown): Pagination {
  const parsed = PaginationSchema.safeParse(query);
  if (!parsed.success) return { limit: 1000, offset: 0 };
  return parsed.data;
}
