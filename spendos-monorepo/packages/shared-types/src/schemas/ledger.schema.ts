import { z } from "zod";

export const PaginationQuerySchema = z.object({
  take: z.coerce.number().int().positive().max(100).optional().default(50),
  cursor: z.string().optional(),
});

export const PaginatedResponseSchema = z.object({
  data: z.array(z.any()),
  meta: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean()
  })
});

export const getWalletsResponseSchema = PaginatedResponseSchema;
export const getLedgerResponseSchema = PaginatedResponseSchema;
export const getJournalGroupsResponseSchema = PaginatedResponseSchema;
