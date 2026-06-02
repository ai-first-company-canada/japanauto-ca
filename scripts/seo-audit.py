#!/usr/bin/env python3
"""
seo-audit.py — pre-deploy SEO/GEO gate for japanauto.ca.

Scans the built static output (the exact HTML search crawlers and answer
engines see) and verifies every indexable page carries the on-page signals we
rely on. Run it after `astro build`, before `wrangler pages deploy`.

    python3 scripts/seo-audit.py [dist_dir]   # default: ./dist

Exit code 0 = all hard checks pass (safe to deploy).
Exit code 1 = one or more ERRORS (do not deploy).

HARD ERRORS (block deploy), checked on every *indexable* page:
  - missing <title> / meta description / canonical
  - canonical that doesn't point at the page's own production URL
  - not exactly one <h1>
  - missing Open Graph (og:title/description/image/url)
  - no JSON-LD at all

WARNINGS (reported, never block) — judgement calls, not correctness bugs:
  - a visible FAQ with no FAQPage markup (legitimate when answers are
    placeholder/"coming soon" — Google policy forbids marking those up)
  - meta description outside ~70-165 chars
  - title (entity-decoded) outside ~25-65 chars
  - thin body copy (<200 words)

noindex pages (e.g. the auth-gated /dealer/* portal) and 404 are excluded
from the hard checks by design — they are intentionally not SEO surfaces.
"""
import re, json, os, sys, html
from collections import defaultdict, Counter

PROD = 'https://japanauto.ca'
CITIES = {'toronto', 'montreal', 'vancouver', 'calgary', 'edmonton', 'ottawa'}
MAKES = {'toyota', 'honda', 'nissan', 'mazda', 'subaru', 'lexus', 'acura', 'infiniti', 'mitsubishi'}


def classify(rel):
    if rel == 'index.html':
        return 'home'
    if rel == '404.html':
        return '404'
    p = rel.split('/')[:-1]
    if not p:
        return 'other'
    c0 = p[0]
    if c0 in CITIES:
        if len(p) == 1:
            return 'city-hub'
        if p[1] == 'parts':
            return {2: 'city-parts-hub', 3: 'city-parts-brand', 4: 'city-parts-model'}.get(len(p), 'city-other')
        return {2: 'city-brand', 3: 'city-model'}.get(len(p), 'city-other')
    if c0 == 'used-cars':
        if len(p) == 1:
            return 'uc-hub'
        if p[1] == 'listing':
            return 'uc-listing'
        return {2: 'uc-brand', 3: 'uc-model'}.get(len(p), 'uc-other')
    if c0 == 'parts':
        if len(p) == 1:
            return 'parts-hub'
        if p[1] == 'listing':
            return 'parts-listing'
        return {2: 'parts-brand', 3: 'parts-model'}.get(len(p), 'parts-other')
    if c0 == 'brands':
        return 'brands-hub' if len(p) == 1 else 'brand-page'
    if c0 == 'blog':
        return 'blog-hub' if len(p) == 1 else 'blog-post'
    if c0 == 'glossary':
        return 'glossary-hub' if len(p) == 1 else 'glossary-term'
    return c0


def own_url(rel):
    if rel == 'index.html':
        return f'{PROD}/'
    if rel == '404.html':
        return None
    return f'{PROD}/' + rel[:-len('index.html')]


def visible_text(h):
    b = re.sub(r'<script.*?</script>', ' ', h, flags=re.S)
    b = re.sub(r'<style.*?</style>', ' ', b, flags=re.S)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', b)).strip()


def graph_types(h):
    out = []
    for b in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(b)
        except Exception:
            out.append('PARSE_ERROR')
            continue
        nodes = d.get('@graph', [d]) if isinstance(d, dict) else d
        for n in nodes:
            if isinstance(n, dict) and '@type' in n:
                t = n['@type']
                out.append(t if isinstance(t, str) else str(t))
    return out


def scan(dist):
    pages = []
    for root, _, files in os.walk(dist):
        for f in files:
            if not f.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(root, f), dist)
            h = open(os.path.join(root, f), encoding='utf-8', errors='replace').read()
            t = re.search(r'<title>(.*?)</title>', h, re.S)
            d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', h)
            c = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]*)"', h)
            robots = re.search(r'<meta[^>]+name="robots"[^>]+content="([^"]*)"', h)
            pages.append(dict(
                rel=rel, grp=classify(rel), own=own_url(rel),
                title=html.unescape(t.group(1).strip()) if t else '',
                desc=d.group(1).strip() if d else '',
                can=c.group(1) if c else '',
                noindex=bool(robots and 'noindex' in robots.group(1).lower()),
                h1=len(re.findall(r'<h1[\s>]', h)),
                og=all(re.search(r'property="og:' + k + '"', h) for k in ('title', 'description', 'image', 'url')),
                types=graph_types(h),
                words=len(visible_text(h).split()),
                faq_visible=bool(re.search(r'Common questions|Frequently asked|>FAQ<', h, re.I)),
            ))
    return pages


def main():
    dist = sys.argv[1] if len(sys.argv) > 1 else 'dist'
    if not os.path.isdir(dist):
        print(f"✗ dist directory not found: {dist}  (run `npm run build` first)")
        return 2
    pages = scan(dist)
    groups = defaultdict(list)
    for p in pages:
        groups[p['grp']].append(p)

    errors, warnings = [], []
    for p in pages:
        idx = not p['noindex'] and p['grp'] != '404'
        if idx:
            if not p['title']:
                errors.append((p['rel'], 'missing <title>'))
            if not p['desc']:
                errors.append((p['rel'], 'missing meta description'))
            if not p['can']:
                errors.append((p['rel'], 'missing canonical'))
            elif p['own'] and p['can'] != p['own']:
                errors.append((p['rel'], f"canonical {p['can']} != own {p['own']}"))
            if p['h1'] != 1:
                errors.append((p['rel'], f"h1 count = {p['h1']} (want 1)"))
            if not p['og']:
                errors.append((p['rel'], 'missing Open Graph tags'))
            if not p['types']:
                errors.append((p['rel'], 'no JSON-LD'))
            if 'PARSE_ERROR' in p['types']:
                errors.append((p['rel'], 'invalid JSON-LD'))
            # warnings
            if p['faq_visible'] and 'FAQPage' not in p['types']:
                warnings.append((p['rel'], 'visible FAQ without FAQPage (ok if answers are placeholder)'))
            if p['desc'] and not (70 <= len(p['desc']) <= 165):
                warnings.append((p['rel'], f"description {len(p['desc'])} chars (want 70-165)"))
            if p['title'] and not (25 <= len(p['title']) <= 65):
                warnings.append((p['rel'], f"title {len(p['title'])} chars (want 25-65)"))
            if p['words'] < 200:
                warnings.append((p['rel'], f"thin content ({p['words']} words)"))

    # ---- report ----
    idxn = sum(1 for p in pages if not p['noindex'] and p['grp'] != '404')
    print(f"SEO/GEO audit — {len(pages)} pages ({idxn} indexable) in {dist}/\n")
    hdr = f"{'GROUP':<18}{'n':>4} {'idx':>4} {'title':>6}{'desc':>5}{'canOK':>6}{'h1=1':>5}{'og':>4}{'JSON-LD':>8}{'FAQp':>5}"
    print(hdr)
    print('-' * len(hdr))
    for g in sorted(groups):
        ps = groups[g]
        idxp = [p for p in ps if not p['noindex'] and g != '404']
        n = len(ps)
        ix = len(idxp)
        def cnt(fn, base=idxp):
            return sum(1 for p in base if fn(p))
        title = cnt(lambda p: p['title'])
        desc = cnt(lambda p: p['desc'])
        canok = cnt(lambda p: p['can'] and p['own'] and p['can'] == p['own'])
        h1 = cnt(lambda p: p['h1'] == 1)
        og = cnt(lambda p: p['og'])
        js = cnt(lambda p: bool(p['types']))
        faqp = cnt(lambda p: 'FAQPage' in p['types'])
        def mark(v):
            return str(v) if v == ix else f"{v}!"
        print(f"{g:<18}{n:>4} {ix:>4} {mark(title):>6}{mark(desc):>5}{mark(canok):>6}{mark(h1):>5}{mark(og):>4}{mark(js):>8}{faqp:>5}")

    if warnings:
        wc = Counter(w.split(' (')[0].split(' without')[0].split(' chars')[0] for _, w in warnings)
        print(f"\nWARNINGS: {len(warnings)} (non-blocking)")
        for kind, n in wc.most_common():
            print(f"  · {n:>4}  {kind}")

    print()
    if errors:
        print(f"❌ AUDIT FAILED — {len(errors)} error(s):")
        for rel, msg in errors[:40]:
            print(f"   {rel}: {msg}")
        if len(errors) > 40:
            print(f"   … and {len(errors) - 40} more")
        return 1
    print("✅ AUDIT PASSED — all indexable pages carry title, description, "
          "self-canonical, single H1, Open Graph, and JSON-LD.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
