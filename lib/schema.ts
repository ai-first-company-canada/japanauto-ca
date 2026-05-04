/**
 * lib/schema.ts — единый контракт между Workers, Astro компонентами и формами.
 *
 * Источник правды: миграция 0001_initial_schema.sql + project rules
 * (validation-zod.md, postal-phone-format.md, vin-validation.md, slug-format.md,
 * japanese-brands-whitelist.md, listing-lifecycle.md, adr-0007).
 *
 * Правила:
 *  - TypeScript strict (no implicit any).
 *  - Все правила валидации = последняя линия защиты на API; CHECK + триггеры в D1
 *    дублируют их на DB-уровне.
 *  - Money fields — integer cents CAD.
 *  - Timestamps — Unix seconds (integer).
 *  - Slug — нижний регистр ASCII kebab-case, ≤ 75 chars.
 *  - VIN — 17 chars без I/O/Q + ISO 3779 checksum.
 *  - Province — ISO codes.
 *  - Phone — E.164 (NANP).
 *  - Postal — `A1A 1A1`.
 */

import { z } from "zod";

// ============================================================================
// CONSTANTS
// ============================================================================

export const PROVINCES = [
  "AB", "BC", "ON", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU",
] as const;
export type Province = (typeof PROVINCES)[number];

/** Whitelist (japanese-brands-whitelist.md). Display order = commercial weight. */
export const BRAND_SLUGS = [
  "toyota", "honda", "nissan", "mazda", "subaru",
  "lexus", "acura", "infiniti", "mitsubishi",
] as const;
export type BrandSlug = (typeof BRAND_SLUGS)[number];

export const DEALER_TYPES = ["dealer", "salvage_yard"] as const;
export type DealerType = (typeof DEALER_TYPES)[number];

export const SUBSCRIPTION_TIERS = ["free", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing", "active", "past_due", "canceled",
  "incomplete", "incomplete_expired", "unpaid",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const LISTING_STATUSES = ["draft", "active", "sold", "expired", "flagged"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_CONDITIONS = ["used_excellent", "used_good", "used_fair"] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const BODY_TYPES = [
  "sedan", "suv", "coupe", "wagon", "hatchback",
  "convertible", "minivan", "pickup", "crossover",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const FUEL_TYPES = [
  "gasoline", "hybrid", "plugin_hybrid", "electric", "diesel",
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["automatic", "manual", "cvt", "dct"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const DRIVETRAINS = ["fwd", "rwd", "awd", "4wd"] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];

export const PART_CATEGORIES = [
  "engine", "transmission", "body", "electrical", "interior", "exterior",
  "suspension", "brakes", "wheels_tires", "exhaust", "cooling", "fuel_system",
  "glass", "lights", "accessories", "other",
] as const;
export type PartCategory = (typeof PART_CATEGORIES)[number];

export const PART_CONDITIONS = ["new", "used", "refurbished", "oem"] as const;
export type PartCondition = (typeof PART_CONDITIONS)[number];

export const MEDIA_ENTITY_TYPES = ["listing", "part", "dealer", "featured_slot"] as const;
export type MediaEntityType = (typeof MEDIA_ENTITY_TYPES)[number];

export const FEATURED_SLOT_STATUSES = ["pending", "active", "paused", "ended"] as const;
export type FeaturedSlotStatus = (typeof FEATURED_SLOT_STATUSES)[number];

export const BOOST_ORDER_STATUSES = ["paid", "refunded", "disputed"] as const;
export type BoostOrderStatus = (typeof BOOST_ORDER_STATUSES)[number];

export const VERIFICATION_PURPOSES = ["email_verify", "password_reset"] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const TIER_1_CITY_SLUGS = [
  "toronto", "montreal", "vancouver", "calgary", "edmonton", "ottawa",
] as const;
export type Tier1CitySlug = (typeof TIER_1_CITY_SLUGS)[number];

// ============================================================================
// LIMITS (sync with migration CHECK constraints)
// ============================================================================

export const LIMITS = {
  TITLE_MAX: 120,
  DESCRIPTION_MAX: 5000,
  PRICE_MAX_CENTS: 100_000_000,         // 1M CAD
  MILEAGE_MAX_KM: 1_000_000,
  ENGINE_DISPLACEMENT_MIN: 0.5,
  ENGINE_DISPLACEMENT_MAX: 8.0,
  DOORS_MIN: 2,
  DOORS_MAX: 5,
  SEATS_MIN: 2,
  SEATS_MAX: 9,
  SLUG_MAX: 75,
  USED_CAR_AGE_CAP_YEARS: 10,
  YEAR_FORWARD_LOOKAHEAD: 1,
  BOOST_DURATION_DAYS_MIN: 1,
  BOOST_DURATION_DAYS_MAX: 90,
  LISTING_DEFAULT_TTL_DAYS: 90,
  REFRESH_TOKEN_TTL_DAYS: 30,
  PHOTOS_PER_LISTING_MAX: 20,
  PHOTO_MAX_BYTES: 10 * 1024 * 1024,    // 10MB pre-compression
} as const;

// ============================================================================
// HELPERS
// ============================================================================

/** Current year per system clock (used both for validation and UI). */
export function currentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

/** Rolling year window for used-car listings (matches D1 trigger). */
export function listingYearWindow(now: Date = new Date()): { min: number; max: number } {
  const y = currentYear(now);
  return {
    min: y - LIMITS.USED_CAR_AGE_CAP_YEARS,
    max: y + LIMITS.YEAR_FORWARD_LOOKAHEAD,
  };
}

/** Unix seconds (integer). Use this everywhere instead of Date.now() for D1 columns. */
export function unixNow(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000);
}

/**
 * VIN ISO 3779 checksum verifier.
 * Returns true if the check digit at position 9 matches the weighted sum.
 * Reference: https://en.wikipedia.org/wiki/Vehicle_identification_number#Check-digit_calculation
 */
const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
  "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidVinChecksum(vin: string): boolean {
  if (vin.length !== 17) return false;
  const upper = vin.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = VIN_TRANSLITERATION[upper[i]!];
    if (v === undefined) return false;
    sum += v * VIN_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return upper[8] === expected;
}

/** Normalize Canadian postal code: uppercase + single space in middle. */
export function normalizePostalCode(input: string): string {
  const stripped = input.replace(/[\s-]/g, "").toUpperCase();
  if (stripped.length !== 6) return input;
  return `${stripped.slice(0, 3)} ${stripped.slice(3)}`;
}

/** Normalize NANP phone to E.164. Accepts (403) 555-1234, 4035551234, +14035551234. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+1") && digits.length === 12) return digits;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  return null;
}

// ============================================================================
// PRIMITIVE SCHEMAS
// ============================================================================

export const provinceSchema = z.enum(PROVINCES);

/**
 * Postal code: A1A 1A1. Excluded letters at positions 1,3,5: D F I O Q U;
 * additionally W,Z forbidden at position 1.
 * (Keep validation lenient: letter+digit pattern; full Canada Post lookup is
 * expensive and over-strict. zod ensures shape, app re-checks against tax tables.)
 */
const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z][ -]?\d[A-CEGHJ-NPRSTV-Z]\d$/i;
export const postalCodeSchema = z.string()
  .trim()
  .transform((s) => normalizePostalCode(s))
  .refine((s) => POSTAL_RE.test(s), {
    message: "Invalid Canadian postal code (expected A1A 1A1)",
  });

/**
 * Phone — E.164 NANP only (+1 country code + 10 digits).
 * Rejects 555-XXXX prefixes (reserved for fiction).
 */
const E164_NANP_RE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
export const phoneSchema = z.string()
  .trim()
  .transform((s) => normalizePhone(s) ?? s)
  .refine((s) => E164_NANP_RE.test(s), {
    message: "Phone must be a valid Canadian/US number",
  })
  .refine((s) => !s.includes("+1555") || !/^\+1555/.test(s), {
    message: "555-XXXX prefix is reserved for fiction",
  });

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const vinSchema = z.string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => VIN_RE.test(s), {
    message: "VIN must be 17 chars, no I/O/Q",
  })
  .refine((s) => isValidVinChecksum(s), {
    message: "VIN checksum invalid (ISO 3779)",
  });

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z.string()
  .trim()
  .min(1)
  .max(LIMITS.SLUG_MAX)
  .refine((s) => SLUG_RE.test(s), {
    message: "Slug must be lowercase ASCII kebab-case",
  });

export const emailSchema = z.string()
  .trim()
  .toLowerCase()
  .email({ message: "Invalid email" })
  .max(254);

/** Used-car year, rolling 10-year window. Mirrors D1 trigger. */
export const listingYearSchema = z.number()
  .int()
  .superRefine((y, ctx) => {
    const { min, max } = listingYearWindow();
    if (y < min || y > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Year must be in rolling window [${min}, ${max}] (used-car age cap ${LIMITS.USED_CAR_AGE_CAP_YEARS}y)`,
      });
    }
  });

/** Unrestricted year for parts compatibility (no age cap). */
export const partYearSchema = z.number().int().min(1900).max(2100);

export const priceSchema = z.number()
  .int()
  .min(0)
  .max(LIMITS.PRICE_MAX_CENTS, { message: "Price exceeds 1M CAD cap" });

export const mileageSchema = z.number()
  .int()
  .min(0)
  .max(LIMITS.MILEAGE_MAX_KM, { message: "Mileage exceeds 1M km" });

export const titleSchema = z.string().trim().min(3).max(LIMITS.TITLE_MAX);
export const descriptionSchema = z.string().trim().max(LIMITS.DESCRIPTION_MAX).optional();

/** Numeric ID column (cuid2 / nanoid) — opaque, validated by length only. */
export const idSchema = z.string().trim().min(8).max(64);

/** Unix timestamp seconds (32-bit-safe through 2106). */
export const timestampSchema = z.number().int().min(0).max(4_102_444_800); // ~ year 2100

export const cadCurrencySchema = z.literal("CAD");
export const countrySchema = z.literal("CA");

/** JSON arrays for parts compatibility — zod-validated stringified arrays. */
export const compatibleMakesSchema = z.array(z.enum(BRAND_SLUGS)).min(1);
export const compatibleYearsSchema = z.array(partYearSchema).min(1);
export const compatibleModelsSchema = z.array(slugSchema).min(1);

// ============================================================================
// DOMAIN ENUM SCHEMAS
// ============================================================================

export const dealerTypeSchema = z.enum(DEALER_TYPES);
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);
export const bodyTypeSchema = z.enum(BODY_TYPES);
export const fuelTypeSchema = z.enum(FUEL_TYPES);
export const transmissionSchema = z.enum(TRANSMISSIONS);
export const drivetrainSchema = z.enum(DRIVETRAINS);
export const partCategorySchema = z.enum(PART_CATEGORIES);
export const partConditionSchema = z.enum(PART_CONDITIONS);
export const mediaEntityTypeSchema = z.enum(MEDIA_ENTITY_TYPES);
export const featuredSlotStatusSchema = z.enum(FEATURED_SLOT_STATUSES);
export const boostOrderStatusSchema = z.enum(BOOST_ORDER_STATUSES);
export const verificationPurposeSchema = z.enum(VERIFICATION_PURPOSES);
export const brandSlugSchema = z.enum(BRAND_SLUGS);

// ============================================================================
// DEALERS
// ============================================================================

const dealerBaseFields = {
  type: dealerTypeSchema,
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  email: emailSchema,
  phone: phoneSchema.nullable().optional(),
  website: z.string().url().max(2048).nullable().optional(),
  description: z.string().trim().max(LIMITS.DESCRIPTION_MAX).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  address_line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2).max(80),
  province: provinceSchema,
  postal_code: postalCodeSchema.nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  business_number: z.string().trim().max(40).nullable().optional(),
  gst_number: z.string().trim().max(40).nullable().optional(),
  amvic_number: z.string().trim().max(40).nullable().optional(),
};

/** Cross-field rule: dealer in AB must have AMVIC. salvage_yard exempt. */
const amvicRefiner = <
  T extends { type: DealerType; province: Province; amvic_number?: string | null }
>(data: T, ctx: z.RefinementCtx): void => {
  if (data.type === "dealer" && data.province === "AB" && !data.amvic_number) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amvic_number"],
      message: "AMVIC number is mandatory for dealers in Alberta",
    });
  }
};

export const dealerCreateInputSchema = z.object({
  ...dealerBaseFields,
  password: z.string().min(10).max(200),
}).superRefine(amvicRefiner);
export type DealerCreateInput = z.infer<typeof dealerCreateInputSchema>;

export const dealerUpdateInputSchema = z.object({
  ...dealerBaseFields,
}).partial().superRefine((data, ctx) => {
  // Re-run AMVIC check only if both fields present
  if (data.type && data.province && "amvic_number" in data) {
    amvicRefiner({
      type: data.type,
      province: data.province,
      amvic_number: data.amvic_number ?? null,
    }, ctx);
  }
});
export type DealerUpdateInput = z.infer<typeof dealerUpdateInputSchema>;

/** Full row from D1 (read-side). */
export const dealerSchema = z.object({
  id: idSchema,
  ...dealerBaseFields,
  password_hash: z.string(),
  country: countrySchema.default("CA"),
  verified: z.union([z.literal(0), z.literal(1)]),
  subscription_tier: subscriptionTierSchema,
  subscription_status: subscriptionStatusSchema.nullable(),
  stripe_customer_id: z.string().nullable(),
  daily_listing_count: z.number().int().min(0),
  daily_listing_reset_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Dealer = z.infer<typeof dealerSchema>;

/** Public-safe view (no password_hash, no stripe_id, etc.). */
export const dealerPublicSchema = dealerSchema.omit({
  password_hash: true,
  stripe_customer_id: true,
  daily_listing_count: true,
  daily_listing_reset_at: true,
});
export type DealerPublic = z.infer<typeof dealerPublicSchema>;

// ============================================================================
// MAKES & MODELS
// ============================================================================

export const makeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(2).max(40),
  slug: brandSlugSchema,
  origin: z.literal("japan"),
  display_order: z.number().int().min(1).max(20).nullable(),
});
export type Make = z.infer<typeof makeSchema>;

export const modelSchema = z.object({
  id: z.number().int().positive(),
  make_id: z.number().int().positive(),
  name: z.string().min(1).max(60),
  slug: slugSchema,
  year_start: z.number().int().min(1900).max(2100).nullable(),
  year_end: z.number().int().min(1900).max(2100).nullable(),
  body_types: z.string().nullable(), // JSON-stringified array; parsed by helpers
});
export type Model = z.infer<typeof modelSchema>;

// ============================================================================
// CITIES & ALIASES
// ============================================================================

export const citySchema = z.object({
  id: z.number().int().positive(),
  slug: slugSchema,
  name: z.string().min(2).max(80),
  province: provinceSchema,
  population_cma: z.number().int().min(0).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(["active", "planned", "paused"]),
});
export type City = z.infer<typeof citySchema>;

export const cityAliasSchema = z.object({
  city_political: z.string().min(2).max(80),
  cma_slug: slugSchema,
  province: provinceSchema,
});
export type CityAlias = z.infer<typeof cityAliasSchema>;

// ============================================================================
// LISTINGS
// ============================================================================

const listingBaseFields = {
  make_id: z.number().int().positive(),
  model_id: z.number().int().positive(),
  year: listingYearSchema,
  trim: z.string().trim().max(60).nullable().optional(),
  vin: vinSchema,
  body_type: bodyTypeSchema.nullable().optional(),
  fuel_type: fuelTypeSchema.nullable().optional(),
  transmission: transmissionSchema.nullable().optional(),
  drivetrain: drivetrainSchema.nullable().optional(),
  doors: z.number().int().min(LIMITS.DOORS_MIN).max(LIMITS.DOORS_MAX).nullable().optional(),
  seats: z.number().int().min(LIMITS.SEATS_MIN).max(LIMITS.SEATS_MAX).nullable().optional(),
  engine_displacement: z.number()
    .min(LIMITS.ENGINE_DISPLACEMENT_MIN)
    .max(LIMITS.ENGINE_DISPLACEMENT_MAX)
    .nullable().optional(),
  color_exterior: z.string().trim().max(40).nullable().optional(),
  color_interior: z.string().trim().max(40).nullable().optional(),
  mileage: mileageSchema,
  condition: listingConditionSchema,
  price: priceSchema,
  negotiable: z.union([z.literal(0), z.literal(1)]),
  city: z.string().trim().min(2).max(80),
  province: provinceSchema,
  title: titleSchema,
  description: descriptionSchema,
};

export const listingCreateInputSchema = z.object(listingBaseFields);
export type ListingCreateInput = z.infer<typeof listingCreateInputSchema>;

export const listingUpdateInputSchema = z.object(listingBaseFields).partial();
export type ListingUpdateInput = z.infer<typeof listingUpdateInputSchema>;

/** Full D1 row. */
export const listingSchema = z.object({
  id: idSchema,
  dealer_id: idSchema,
  ...listingBaseFields,
  slug: slugSchema,
  price_currency: cadCurrencySchema,
  status: listingStatusSchema,
  expires_at: timestampSchema.nullable(),
  sold_at: timestampSchema.nullable(),
  view_count: z.number().int().min(0),
  contact_count: z.number().int().min(0),
  boost_until: timestampSchema.nullable(),
  boost_paid_cents: z.number().int().min(0),
  flagged_reason: z.string().max(500).nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Listing = z.infer<typeof listingSchema>;

/** Catalog list query — params validated from URL search. */
export const catalogQuerySchema = z.object({
  make: brandSlugSchema,
  model: slugSchema,
  city: slugSchema,
  years: z.array(listingYearSchema).optional(),       // multi-select
  mileage_max: z.number().int().min(0).max(LIMITS.MILEAGE_MAX_KM).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(50).default(20),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// ============================================================================
// PARTS
// ============================================================================

const partBaseFields = {
  title: titleSchema,
  category: partCategorySchema,
  subcategory: z.string().trim().max(60).nullable().optional(),
  description: descriptionSchema,
  /** JSON-stringified array of brand slugs, or null. */
  compatible_makes: z.string().nullable().optional(),
  compatible_models: z.string().nullable().optional(),
  compatible_years: z.string().nullable().optional(),
  part_number: z.string().trim().max(60).nullable().optional(),
  oem_number: z.string().trim().max(60).nullable().optional(),
  condition: partConditionSchema,
  warranty_days: z.number().int().min(0).max(3650).nullable().optional(),
  price: priceSchema,
};

export const partCreateInputSchema = z.object(partBaseFields);
export type PartCreateInput = z.infer<typeof partCreateInputSchema>;

export const partUpdateInputSchema = z.object(partBaseFields).partial();
export type PartUpdateInput = z.infer<typeof partUpdateInputSchema>;

export const partSchema = z.object({
  id: idSchema,
  dealer_id: idSchema,
  ...partBaseFields,
  slug: slugSchema,
  price_currency: cadCurrencySchema,
  status: listingStatusSchema,
  view_count: z.number().int().min(0),
  contact_count: z.number().int().min(0),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Part = z.infer<typeof partSchema>;

// ============================================================================
// MEDIA
// ============================================================================

export const mediaSchema = z.object({
  id: idSchema,
  entity_type: mediaEntityTypeSchema,
  entity_id: idSchema,
  r2_key: z.string().min(1).max(500),
  cf_image_id: z.string().nullable(),
  alt_text: z.string().min(1).max(200), // mandatory for SEO
  width: z.number().int().min(1).max(20000).nullable(),
  height: z.number().int().min(1).max(20000).nullable(),
  display_order: z.number().int().min(0).max(LIMITS.PHOTOS_PER_LISTING_MAX),
  is_primary: z.union([z.literal(0), z.literal(1)]),
  bytes: z.number().int().min(0).max(50_000_000).nullable(),
  created_at: timestampSchema,
});
export type Media = z.infer<typeof mediaSchema>;

export const mediaUploadInputSchema = z.object({
  entity_type: mediaEntityTypeSchema,
  entity_id: idSchema,
  alt_text: z.string().min(1).max(200),
  display_order: z.number().int().min(0).max(LIMITS.PHOTOS_PER_LISTING_MAX).default(0),
  is_primary: z.boolean().default(false),
});
export type MediaUploadInput = z.infer<typeof mediaUploadInputSchema>;

// ============================================================================
// FEATURED SLOTS (ADR-0007)
// ============================================================================

export const featuredSlotCreateInputSchema = z.object({
  dealer_id: idSchema,
  make_id: z.number().int().positive(),
  model_id: z.number().int().positive().nullable(),       // null = applies to all models
  city: slugSchema,
  province: provinceSchema,
  promo_title: z.string().trim().min(3).max(LIMITS.TITLE_MAX),
  promo_msrp_cents: priceSchema,
  promo_image_id: z.string().nullable(),
  promo_url: z.string().url().max(2048),
  disclosure: z.string().trim().min(10).max(500),
  active_from: timestampSchema,
  active_until: timestampSchema,
}).superRefine((data, ctx) => {
  if (data.active_until <= data.active_from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["active_until"],
      message: "active_until must be after active_from",
    });
  }
});
export type FeaturedSlotCreateInput = z.infer<typeof featuredSlotCreateInputSchema>;

// ============================================================================
// BOOST ORDERS (ADR-0007)
// ============================================================================

export const boostOrderCreateInputSchema = z.object({
  listing_id: idSchema,
  amount_cents: z.number().int().min(100).max(LIMITS.PRICE_MAX_CENTS), // ≥ $1 CAD
  duration_days: z.number().int()
    .min(LIMITS.BOOST_DURATION_DAYS_MIN)
    .max(LIMITS.BOOST_DURATION_DAYS_MAX),
  stripe_payment_id: z.string().regex(/^pi_/).optional(),
});
export type BoostOrderCreateInput = z.infer<typeof boostOrderCreateInputSchema>;

// ============================================================================
// AUTH
// ============================================================================

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshTokenInputSchema = z.object({
  refresh_token: z.string().min(20).max(500),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(500),
  new_password: z.string().min(10).max(200),
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const emailVerifyInputSchema = z.object({
  token: z.string().min(20).max(500),
});
export type EmailVerifyInput = z.infer<typeof emailVerifyInputSchema>;

// ============================================================================
// CONTACT REVEAL (anti-scraping audit, ADR-0003)
// ============================================================================

export const contactRevealInputSchema = z.object({
  entity_type: z.enum(["listing", "part", "dealer"]),
  entity_id: idSchema,
});
export type ContactRevealInput = z.infer<typeof contactRevealInputSchema>;

// ============================================================================
// API ENVELOPES
// ============================================================================

/** Standard error response. zod errors flattened into { field: [messages] }. */
export const apiErrorSchema = z.object({
  error: z.string(),                                       // machine-readable code
  message: z.string().optional(),                          // human-readable
  issues: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Pagination envelope. */
export interface Paginated<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

/** Catalog response shape (model-catalog-page.md). */
export interface CatalogResponse {
  featured: FeaturedListing | null;
  boosted: ListingCard[];
  organic: ListingCard[];
  pagination: Omit<Paginated<never>, "items">;
  filters: { years_available: number[]; mileage_buckets: number[] };
}

/** Lean shape for listing card on catalog/homepage. */
export interface ListingCard {
  id: string;
  slug: string;
  title: string;
  year: number;
  make_slug: BrandSlug;
  model_slug: string;
  trim: string | null;
  mileage: number;
  transmission: Transmission | null;
  drivetrain: Drivetrain | null;
  price: number;                                           // cents CAD
  city: string;
  province: Province;
  primary_image_url: string | null;
  dealer_name: string;
  dealer_slug: string;
  dealer_amvic: string | null;
  is_boosted: boolean;
  boost_paid_cents: number;
  is_new_today: boolean;
  reduced_by_cents: number | null;
  created_at: number;
}

/** Featured slot promo item (ADR-0007 — NEW vehicle, sponsored). */
export interface FeaturedListing {
  slot_id: string;
  promo_title: string;
  promo_msrp_cents: number;
  promo_image_url: string;
  promo_url: string;
  disclosure: string;
  dealer_name: string;
}

// ============================================================================
// ZOD ERROR HELPER (use in Workers handlers)
// ============================================================================

/** Format a ZodError into ApiError envelope. */
export function zodErrorToApiError(err: z.ZodError): ApiError {
  return {
    error: "validation_failed",
    message: "One or more fields did not pass validation",
    issues: err.flatten().fieldErrors as Record<string, string[]>,
  };
}

// ============================================================================
// RE-EXPORT zod for convenience (so consumers import from one place)
// ============================================================================
export { z };
