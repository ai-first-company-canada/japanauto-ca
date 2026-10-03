/**
 * src/lib/model-copy.ts — page-specific facts for model-page copy.
 *
 * Model pages (city × make × model and national make × model) used to share
 * one fixed sentence per slot with only the names swapped. These helpers turn
 * data the repo already holds (the rolling listing window enforced by the
 * listings API, the verified generation map in price-generations.ts) into
 * short phrases so each page says something specific. Nothing is invented:
 * if a model has no generation data, callers fall back to the window alone.
 */

import { PRICE_GENERATIONS } from '../data/price-generations';

/** Mirrors the listings API age cap: current year − 10 … current year + 1. */
export const LISTING_YEAR_MIN = new Date().getUTCFullYear() - 10;

function genLabel(code: string): string | null {
  if (/^\d+(st|nd|rd|th)$/.test(code)) return `${code}-generation`;
  // Internal disambiguators like 'N200-3' are not public chassis codes.
  if (code.includes('-')) return null;
  return code;
}

/**
 * "XV50 (2016–2017), XV70 (2018–2024) and XV80 (2025 on)" for the generations
 * that overlap the listing window, oldest first; null when unknown.
 */
export function generationsInWindow(makeSlug: string, modelSlug: string): string | null {
  const gens = PRICE_GENERATIONS[`${makeSlug}:${modelSlug}`];
  if (!gens) return null;
  const parts = gens
    .filter((g) => g.yearEnd === null || g.yearEnd >= LISTING_YEAR_MIN)
    .slice()
    .reverse()
    .map((g) => {
      const from = Math.max(g.yearStart, LISTING_YEAR_MIN);
      const years = g.yearEnd === null ? `${from} on` : from === g.yearEnd ? `${from}` : `${from}–${g.yearEnd}`;
      const label = genLabel(g.code);
      return label ? `${label} (${years})` : years;
    });
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Number of generations overlapping the listing window (0 when unknown). */
export function generationCountInWindow(makeSlug: string, modelSlug: string): number {
  const gens = PRICE_GENERATIONS[`${makeSlug}:${modelSlug}`] ?? [];
  return gens.filter((g) => g.yearEnd === null || g.yearEnd >= LISTING_YEAR_MIN).length;
}

function genYears(start: number, end: number | null): string {
  return end === null ? `${start} on` : start === end ? `${start}` : `${start}–${end}`;
}

/**
 * Every known generation, oldest first ("XV50 (2012–2017), XV70 (2018–2024)
 * and XV80 (2025 on)") — for parts pages, where donor cars can be older than
 * the listing window. null when the model has no generation data.
 */
export function allGenerationsText(makeSlug: string, modelSlug: string): string | null {
  const gens = PRICE_GENERATIONS[`${makeSlug}:${modelSlug}`];
  if (!gens || gens.length === 0) return null;
  const parts = gens.slice().reverse().map((g) => {
    const label = genLabel(g.code);
    const years = genYears(g.yearStart, g.yearEnd);
    return label ? `${label} (${years})` : years;
  });
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Model years where a mid-generation facelift starts, per the band labels. */
export function faceliftYears(makeSlug: string, modelSlug: string): number[] {
  const gens = PRICE_GENERATIONS[`${makeSlug}:${modelSlug}`] ?? [];
  const years: number[] = [];
  for (const g of gens) {
    for (const [from, , label] of g.bands ?? []) {
      if (label && /facelift/i.test(label)) years.push(from);
    }
  }
  return years.sort((a, b) => a - b);
}
