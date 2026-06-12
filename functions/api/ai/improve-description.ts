/**
 * POST /api/ai/improve-description   (auth: any dealer — textImprover is in
 * both tiers; we want better listing content on Free too)
 *
 * Feature 2 (LAUNCH-PLAN-2026-06): the "Improve text" button in the listing
 * form. Takes the dealer's structured fields + raw draft, returns a clean
 * description draft written by Claude. The dealer reviews and saves it
 * themselves — the model output never touches the database directly, which is
 * the legal/trust backbone of this feature (the dealer publishes the text).
 *
 * No-fabrication rule: the prompt hard-limits the model to the provided facts.
 * The dealer's own draft claims may be kept (they are the dealer's claims),
 * but nothing new may be invented.
 *
 * Body: ImproveDescriptionInput { facts: {...}, draft?: string }
 * Response 200: { description: string }
 * Errors: 401 / 403 (CSRF) / 422 / 429 (20/h per dealer) /
 *         503 not_configured (no ANTHROPIC_API_KEY) / 502 upstream failure
 */

import type { Env } from "../../../types/env";
import { improveDescriptionInputSchema, zodErrorToApiError, LIMITS } from "../../../lib/schema";
import { json, jsonError, badRequest, tooManyRequests } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";

const DEFAULT_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You write listing descriptions for japanauto.ca, a Canadian marketplace for used Japanese cars. Rewrite the dealer's draft into a clean, factual listing description.

HARD RULES:
- Use ONLY the facts in VEHICLE FACTS and claims already present in the dealer's draft. Never invent features, options, equipment, history, or condition claims.
- No superlatives ("best", "perfect", "immaculate"), no guarantees or warranty promises, no financing claims, no urgency phrases ("won't last").
- Do not mention price, phone numbers, URLs, or the dealer's name.
- Plain text only, no markdown or headings. 2-3 short paragraphs, 400-900 characters total. Write in English.

Output only the description text, nothing else.`;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(503, "not_configured",
      "Text improver is not configured — set the ANTHROPIC_API_KEY secret");
  }

  // Spend cap before any parsing — every accepted call is a billable LLM call.
  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.AI_IMPROVE_PER_DEALER);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = improveDescriptionInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const { facts, draft } = parsed.data;

  const factLines = Object.entries(facts)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const userContent =
    `VEHICLE FACTS:\n${factLines}\n\nDEALER DRAFT:\n${draft || "(none — write from the facts alone)"}`;

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.AI_IMPROVER_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("improve-description upstream error", apiRes.status, errText.slice(0, 500));
    return jsonError(502, "upstream_error", "Text improver is temporarily unavailable — try again");
  }

  const data = await apiRes.json() as AnthropicResponse;
  const text = data.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) {
    console.error("improve-description: no text block in response");
    return jsonError(502, "upstream_error", "Text improver returned no text — try again");
  }

  return json({ description: text.slice(0, LIMITS.DESCRIPTION_MAX) });
};
