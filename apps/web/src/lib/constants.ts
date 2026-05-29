export const CONDITIONS = [
  "Mint",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

export const LANGUAGES = ["EN", "JP", "ID", "KR", "CN", "Other"] as const;

export const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "ACE", "Other"] as const;

export const PRICING_MODES = ["fixed", "negotiable"] as const;

export type Condition = (typeof CONDITIONS)[number];
export type Language = (typeof LANGUAGES)[number];
export type GradingCompany = (typeof GRADING_COMPANIES)[number];
export type PricingMode = (typeof PRICING_MODES)[number];
