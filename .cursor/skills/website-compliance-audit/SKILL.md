---
name: website-compliance-audit
description: Audits and fixes a website codebase against an 11-point legal/compliance checklist (privacy policy, terms, cookie policy, refund policy, consent banner, data inventory, third-party embeds, alt text and contrast, keyboard accessibility, fake reviews and dark patterns, image licences and local laws) and produces a scored report. Use when the user asks for a compliance audit, legal pages, cookie banner, GDPR/DPDP/CCPA review, accessibility audit, launch readiness for a website, or when adding forms, trackers, embeds, images, or checkout flows.
---

# Website Compliance Auditor and Fixer

Audit this entire codebase against the 11-point checklist below, fix what is safe to fix, and give a report. Do not ask questions unless a target country or "does this site sell anything?" is truly unknown. Ask those once in one message, then continue.

## RULES
- Never invent facts (company name, address, email, jurisdiction, payment provider). Use {{PLACEHOLDERS}} and list them at the end.
- Never fabricate reviews, ratings, user counts, awards, logos, or urgency ("only 2 left").
- Never use images, fonts, or icons without a verifiable licence.
- Legal text is a draft template, not legal advice.
- Legal text must match what the code actually does. Update it whenever the code changes.

## STEP 1: SCAN
List routes, forms, scripts, iframes, images, storage keys, analytics, and payment flows. Use grep for: <input, <form, localStorage, sessionStorage, document.cookie, gtag, fbq, hotjar, clarity, posthog, sentry, <script src, <iframe, hotlinked image URLs, <img without alt, onClick on div/span, outline:none, testimonial|review|rating|trusted by|only \d+ left|guaranteed|#1.

## STEP 2: THE 11 CHECKS
1. Privacy Policy: /privacy-policy exists and is linked in the footer. It covers controller identity, exact data collected, purpose and legal basis, third parties, retention, user rights (access, delete, withdraw consent, opt out of sale/sharing), international transfers, children, security, and a contact or grievance officer.
2. Terms & Conditions: /terms exists. Covers eligibility, accounts, acceptable use, IP, payments and auto-renewal, disclaimers, liability, termination, governing law. It is linked at signup and checkout.
3. Cookie Policy: /cookie-policy has a table of every cookie and storage key (name, provider, purpose, category, duration) that matches the code.
4. Refund Policy (only if anything is sold): window, conditions, process and timeline, cancellation. Consistent with checkout copy.
5. Cookie + form consent: a banner with equal-weight Accept all / Reject all / Manage. No non-essential script or cookie loads before consent. The choice is stored and versioned. A footer "Cookie settings" link lets users change it. Forms have a purpose notice and a Privacy link. The newsletter checkbox is separate and unticked. Terms acceptance is an explicit checkbox.
6. User data collected: create docs/data-inventory.md (item | where collected | purpose | legal basis | stored where | shared with | retention). Remove unnecessary fields. No PII in URLs or logs. Offer a way to delete and export data.
7. Third-party embeds: create docs/third-parties.md for every script, iframe, SDK, font, CDN, map, video, and chat widget. Gate non-essential ones behind consent, using click-to-load for video and maps. Self-host fonts where possible. Add SRI and pinned versions on CDN scripts. Add a Content-Security-Policy. Disclose each provider in the policies.
8. Alt text + colour contrast: every <img> has meaningful alt (decorative = alt=""). Icon-only buttons have aria-label. Contrast is at least 4.5:1 for text and 3:1 for large text and UI components, including over images, in dark mode, and in hover and disabled states. Never use colour alone to convey meaning.
9. Keyboard + clear buttons: use real <button> and <a>, not clickable divs. Visible focus on everything, no outline:none without a replacement. Logical tab order, skip link, modal focus trap, Esc to close. Action-specific labels ("Place order", not "Submit"). Target size at least 24px. Every input has a <label>. Errors are specific and use aria-live. lang attribute, one h1, landmarks, prefers-reduced-motion.
10. Fake reviews / claims / dark patterns: remove or label [SAMPLE] any hardcoded testimonials, ratings, counters, awards, press logos, or fake urgency. Unsupported claims (best, #1, guaranteed, health, finance, security) are removed or softened. Pricing shows total, taxes, fees, and renewal terms. No pre-ticked add-ons, hidden fees, confirm-shaming, or hard-to-cancel flows.
11. Copyrighted images + local laws: create docs/asset-licenses.md (file | source URL | licence | attribution | date checked). Flag hotlinked, unknown-source, watermarked, brand, or celebrity images. Recommend Unsplash, Pexels, Pixabay (check terms), or original work. Map the target countries to their laws:
   - India: DPDP Act 2023, IT Act, E-Commerce Rules 2020, Copyright Act
   - EU/UK: GDPR, ePrivacy, Consumer Rights Directive, EAA
   - US: CCPA/CPRA, COPPA, CAN-SPAM, FTC review rules, ADA, DMCA
   If the audience is unknown, apply the strictest baseline and state that assumption.

## STEP 3: FIX
Auto-fix low-risk items: alt text, labels, focus styles, semantic buttons, footer links, consent gating, and the docs files. Generate the missing legal pages and the consent banner in the project's own framework and design. Put {{PLACEHOLDERS}} where real info is needed, and add a "draft, needs lawyer review" comment in each legal file. Do not delete or rewrite unrelated code.

## STEP 4: REPORT
Finish with:
- Score X/11
- A table: # | Check | PASS / FAIL / PARTIAL / N/A | Evidence (file:line) | What I changed
- Critical (fix before launch), Recommended, and Placeholders I need from you
- Files created or changed
- The disclaimer: "Templates only, not legal advice. Have a qualified lawyer review."

Severity guide: Critical = data collected with no policy or consent, trackers firing before consent, fake reviews, unlicensed images, payments without terms or refund. High = missing alt text, keyboard traps, low contrast on primary text or CTAs. Medium = vague labels, no SRI. Low = polish.
