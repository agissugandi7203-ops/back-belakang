---
name: design-taste-frontend
description: Good design taste skill containing layout, typography, styling, and strict anti-slop rules to be applied on every user interface generation.
---

# Good Design Taste & Anti-Slop Guidelines

Use these guidelines to build premium, modern, and high-quality user interfaces.

## Strict Ban List (Anti-Slop System)

1. **Em-dashes and en-dashes**: Banned everywhere in output copy (headlines, eyebrows, pills, body, quotes, attribution, captions, button text, alt text). Use a hyphen or restructure the sentence.
2. **Section-numbering eyebrows**: Banned (e.g., `00 / INDEX`, `001 · Capabilities`, `06 · how it works`). Eyebrows should name the topic in plain language.
3. **Hero version labels**: Banned (e.g., `V0.6`, `BETA`, `INVITE-ONLY`) in the hero unless the brief is explicitly a product launch.
4. **Photo-credit captions as decoration**: Banned (e.g., `Field study no. 12 · Ines Caetano` under stock images). Real attribution to real photographers only.
5. **Hero decoration text strips**: Banned (e.g., `BRAND. MOTION. SPATIAL.`, `TYPE / FORM / MOTION` and other mono-caps strips at the hero bottom).
6. **Pills overlaid on images**: Banned. No labels or tags floating on top of photos. Add a caption directly below the image if needed.
7. **Version footers on marketing pages**: Banned (e.g., `v1.4.2`, `Build 0048`, `last sync 4s ago`). Devtool fixtures do not belong on landing or portfolio pages.
8. **Locale, city, time, weather strips**: Banned (e.g., `Lisbon 14:23 · 18°C` and similar atmospheric strips) for 99% of briefs.
9. **Scroll cues**: Banned (e.g., `Scroll`, down-arrow icons, `Scroll to explore`). The user is at the hero. They know how scroll works.
10. **Decorative status dots**: Zero by default. Only when conveying real semantic state, and at most one per page section.
11. **border-t plus border-b on every row**: Banned on long lists and spec tables. Reach for cards, tabs, scroll-snap pills, marquee, or carousel.
12. **Div-based fake product UI**: Banned. No fake task lists, terminals, or dashboards built out of styled divs. Use real screenshots or generated images.
13. **Three-equal-card feature rows**: Banned by default. Use 2-column zig-zag, asymmetric grids, or scroll-pinned alternatives.
14. **AI-purple and mesh blob gradients**: Banned by default. Neutral bases with one high-contrast accent. The LILA rule overrides only when the brand is explicitly purple.
15. **Hand-rolled decorative SVG illustrations**: Strongly discouraged as default. Acceptable only for a simple geometric mark or when the brief explicitly asks for it.
16. **window.addEventListener('scroll')**: Banned in JS. Use Motion useScroll, GSAP ScrollTrigger, IntersectionObserver, or CSS scroll-driven animations.
