---
name: ai-slop-audit
description: Audit a codebase for AI-looking design, fake content, and missing launch items. Use when asked to review, audit, check, or clean up a site, or at the end of any website build.
---

# AI Slop Audit

Scan all source, styles, and content files. Skip `node_modules`, build output, and lockfiles. Report each check as **PASS** or **FAIL** with file path and line number.

## Checks and detection hints

- **Purple gradients:** grep for `purple`, `violet`, `indigo` in gradient classes (`from-`, `via-`, `to-`, `bg-gradient-`) or `linear-gradient` / `radial-gradient` values. Also `#8b5cf6`, `#6366f1`, `#a855f7`, `#7c3aed`.
- **Pill buttons:** grep `rounded-full` and `9999px` on `button`, `a`, or CTA components.
- **Emoji icons:** regex for emoji characters used as icons or bullets in JSX or HTML, e.g. `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]`.
- **Fake reviews:** hardcoded testimonial arrays or quotes without real names or sources.
- **Fake metrics and counters:** numbers like "10k+", "99%", star ratings, `setInterval` or `Math.random` driving counters.
- **Vague hero text:** H1 that does not name the product, audience, or outcome.
- **Em dashes:** grep the em dash character (U+2014) in copy. Regex: `\u2014`.
- **AI-slop words:** grep the banned list from `20-copy-rules.mdc` (case-insensitive).
- **Scroll animations:** grep `ScrollTrigger`, `locomotive`, `lenis`, `parallax`, scroll-snap hijacking.
- **Cursor animations:** grep `cursor: none`, `cursor-none`, custom cursor components, `mousemove` followers.
- **AI photos:** flag suspicious generated image filenames or sources (e.g. `midjourney`, `dalle`, `ai-generated`, `generated-`, unsplash hotlinks) for human review.
- **Launch items:**
  - Custom domain in config (canonical URL, sitemap, `metadataBase`, site URL env).
  - Favicon files present and linked in head (`favicon.ico`, `apple-touch-icon.png`, manifest 192/512).
  - No "Made with" / "Built with" badge.
  - `/privacy` and `/terms` routes exist and are linked in the footer.
  - Meta title, description, and OG image on every page.
  - No lorem ipsum or placeholder text.

## Output format

1. Summary line: `Audit: X FAIL, Y PASS`.
2. Table of failures:

   | Check | File:line | Suggested fix |
   |---|---|---|

3. Ask before applying fixes.

Never invent replacement data (testimonials, metrics, photos, names). Ask me for it.
