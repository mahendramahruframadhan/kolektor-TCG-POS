import { z } from "zod";

export const CardConditionSchema = z.enum([
  "Mint",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
]);

export const CardLanguageSchema = z.enum(["EN", "JP", "ID", "KR", "CN", "Other"]);
export const CardPricingModeSchema = z.enum(["fixed", "negotiable"]);
export const CardStatusSchema = z.enum(["available", "held", "sold", "returned"]);
export const GradingCompanySchema = z.enum(["PSA", "BGS", "CGC", "SGC", "Other"]);

export const CreateCardSchema = z.object({
  clientId: z.string().uuid(),
  shortId: z.string().regex(/^[A-Z0-9]-[A-Z0-9]{5}$/),
  ownerUserId: z.string().uuid(),
  stockReceivedByUserId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  title: z.string().min(1),
  setName: z.string().default(""),
  setNumber: z.string().default(""),
  rarity: z.string().default(""),
  language: CardLanguageSchema.default("EN"),
  edition: z.string().default(""),
  condition: CardConditionSchema.default("Near Mint"),
  isGraded: z.boolean().default(false),
  gradingCompany: GradingCompanySchema.optional(),
  grade: z.string().optional(),
  certNumber: z.string().optional(),
  pricingMode: CardPricingModeSchema.default("fixed"),
  priceIdr: z.number().int().positive().optional(),
  listedPriceIdr: z.number().int().positive().optional(),
  bottomPriceIdr: z.number().int().positive().optional(),
}).refine(
  (d) =>
    d.pricingMode === "fixed"
      ? d.priceIdr != null
      : d.listedPriceIdr != null && d.bottomPriceIdr != null,
  { message: "fixed cards need priceIdr; negotiable cards need listedPriceIdr + bottomPriceIdr" }
);

export const UpdateCardSchema = z.object({
  title: z.string().min(1).optional(),
  setName: z.string().optional(),
  setNumber: z.string().optional(),
  rarity: z.string().optional(),
  language: CardLanguageSchema.optional(),
  edition: z.string().optional(),
  condition: CardConditionSchema.optional(),
  isGraded: z.boolean().optional(),
  gradingCompany: GradingCompanySchema.optional(),
  grade: z.string().optional(),
  certNumber: z.string().optional(),
  pricingMode: CardPricingModeSchema.optional(),
  priceIdr: z.number().int().positive().optional(),
  listedPriceIdr: z.number().int().positive().optional(),
  bottomPriceIdr: z.number().int().positive().optional(),
  status: CardStatusSchema.optional(),
  version: z.number().int().positive(),
});

export type CreateCard = z.infer<typeof CreateCardSchema>;
export type UpdateCard = z.infer<typeof UpdateCardSchema>;
