# AI-text tells rubric (English, Canadian audience) — japanauto.ca

Goal: text should read like a knowledgeable Canadian used-car editor wrote it — specific, plain, slightly uneven in rhythm, confident where facts allow. NOT like an LLM.

## A. Lexical tells (replace or delete)
delve, dive into, deep dive, navigate (figuratively: "navigate the market/process"), landscape, tapestry, realm, journey (for buying a car), embark,
robust, seamless(ly), comprehensive, holistic, crucial, vital, pivotal, paramount, essential (when filler), key (adjective filler),
leverage, empower, elevate, unlock, unleash, streamline, foster, bolster, harness, ensure (when filler), facilitate, utilize,
boasts, a testament to, stands out, shines, game-changer, peace of mind, hassle-free, stress-free, worry-free, look no further,
ever-evolving, ever-changing, in today's (fast-paced / market / world), when it comes to, it's worth noting, it's important to note/remember,
notably, importantly, interestingly, furthermore, moreover, additionally (as sentence openers), in conclusion, ultimately, overall (as opener),
plethora, myriad, a wide range of, a variety of, various, numerous, nuanced, intricate, meticulous, savvy, discerning,
whether you're X or Y, from X to Y (scope-sweeping), rest assured, without further ado, buckle up, at the end of the day,
"Here's the thing", "Let's break it down", "Here's what you need to know", "The bottom line?".

## B. Structural tells
1. Negative parallelism: "It's not just X — it's Y", "not X, but Y", "isn't about X; it's about Y".
2. Rule-of-three everywhere: triplets of adjectives/nouns/clauses ("reliable, affordable, and practical").
3. Em-dash overuse (more than ~1 per 150 words) — swap most for commas, periods, parentheses, colons.
4. Section closers that restate/moralize: "In short, ...", "This makes X a smart choice for ...", "That's why X matters."
5. Uniform sentence length and paragraph shape; every paragraph 3 sentences. Vary: some short sentences, some long.
6. Bullet lists of "**Label:** explanation." used where prose would be natural; or lists where every item has identical grammar.
7. Rhetorical question openers ("Looking for a reliable used SUV?"), colon headlines ("X: The Ultimate Guide"), "Ultimate/Complete/Definitive guide".
8. Hedge stacks ("may potentially", "can often help to"), vague generalities with no number/place/model/year.
9. Signposting ("In this guide, we'll explore...", "Let's take a look at...", "As mentioned above").
10. Over-symmetric pros/cons, both-sides-ism with no verdict.
11. Cross-page sameness: the same sentence skeleton or phrase reused across many pages (e.g. 9 brand pages with identical intros differing only in the brand name).
12. Faux-precision or unsourced claims ("studies show", "experts agree") — either attribute to a real source already present in the text or soften/remove. NEVER invent sources.
13. Title Case Headings Everywhere — prefer sentence case for H2/H3 unless the site convention is clearly Title Case (check first and stay consistent across the site).

## C. Hard constraints when rewriting
- Do NOT change facts: numbers, prices, years, model names, regulator names, statutes, URLs, internal links, citations, author/reviewer names, dates.
- Do NOT touch frontmatter keys, slugs, schema/JSON-LD code, component props names, data-shape. Frontmatter string values (title, description, FAQ text) may be edited for the same tells, but keep title ≤ 60 chars and description 120–158 chars if they were within that.
- Keep the Answer Capsule (first ~200 words answering the page question directly) — it must still answer directly and stand alone.
- Keep length within ±15% of the original; don't pad, don't drop substance.
- Canadian English spelling (colour, centre, kilometre), dollar amounts as CAD as in the original.
- Don't add new factual claims. If a sentence is pure filler, delete it rather than inventing specifics.
- Don't introduce new AI-tells while fixing (no "simply", no new em-dashes).
