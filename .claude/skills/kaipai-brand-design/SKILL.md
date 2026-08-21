---
name: kaipai-brand-design
description: Visual design and art-direction rules for the KaiPai mental coaching sports platform. Use whenever editing KaiPai public-facing marketing pages, landing pages, homepage, brand sections, typography, visual hierarchy or motion.
---

# KaiPai Brand Design

KaiPai is a premium sports mental-coaching brand.

It must NOT look like a generic AI-generated SaaS landing page.

## Core direction

The visual language should feel:

- premium
- cinematic
- athletic
- editorial
- emotional
- confident
- modern
- minimal
- human

Think sports campaign / Nike / Apple product storytelling rather than B2B SaaS.

## The palette is real — use the tokens

Defined in `app/globals.css`, prefixed `kp-`. These are the brand, not a suggestion:

| Token | Value | Role |
|---|---|---|
| `--color-kp-ink` | `#050507` | the ground; near-black, not grey |
| `--color-kp-ink2` | `#0a0a0d` | a second ground for separation without a border |
| `--color-kp-surface` | `#121217` | raised surface |
| `--color-kp-line` | `rgba(255,255,255,.08)` | a hairline, when space alone will not do |
| `--color-kp-hi` | `#f4f4f6` | primary text |
| `--color-kp-mid` | `#9a9aa6` | secondary text |
| `--color-kp-low` | `#5e5e6b` | tertiary; never for anything that must be read |
| `--color-kp-red` / `--color-kp-red2` | `#e11d2a` / `#f5333f` | **the accent** |
| `--color-kp-red-deep` | `#3a080d` | red as an atmosphere, not as a mark |

**The accent is red.** KaiPai is dark plus red. There is no brand green.

`--color-kp-verify` (`#34d399`) is the one green, and it means **verified / succeeded**. Using it decoratively spends a signal the product relies on elsewhere — the same reason `green` in `mobile/src/theme.tsx` belongs to `Apri videochiamata` and nothing else.

Type is `--font-display` (Space Grotesk), `--font-body` (Inter), `--font-mono` (JetBrains Mono). Display carries the large statements; body is for reading. A literal hex in a marketing component is a defect.

## Avoid generic AI style

Never default to:

- repeated 3-card layouts
- endless rounded cards
- icon + heading + paragraph repeated blocks
- excessive pills and badges
- purple/blue SaaS gradients
- glassmorphism everywhere
- decorative gradients without purpose
- generic abstract blobs
- identical section spacing
- every section inside a container
- excessive shadows
- excessive border radius
- centered text in every section
- unnecessary dashboard visuals
- fade-up animation on every element

Do not solve a design problem by simply adding more cards.

## Prefer

- strong sports photography
- full-bleed imagery
- oversized typography
- large visual statements
- asymmetric composition
- editorial layouts
- intentional whitespace
- sections that occupy most or all of the viewport
- strong contrast
- KaiPai red used selectively as an accent
- typography used as a graphic element
- real athletes and coaches
- one main visual idea per viewport
- cinematic transitions
- scroll-driven storytelling when meaningful

## Content density

The KaiPai homepage must be concise.

Do not present all product information on the homepage.

Each viewport should communicate approximately one idea.

Prefer:

headline
supporting sentence
visual
single action

over large groups of cards or long explanatory text.

## Motion — what is actually installed

Verified in `package.json`; do not assume beyond it.

- **`gsap` 3.15 + `@gsap/react` 2.1** — ScrollTrigger is the substrate of every scroll-driven scene on the marketing pages: `components/landing/scene-mind.tsx`, `scene-pillars.tsx`, `scene-product.tsx`, `scene-founder.tsx`, and everything under `components/landing/v2/`
- **`motion` 12** (the library formerly published as Framer Motion) — used in `components/landing/hero-fx.tsx`
- **`lenis` 1.3** — smooth scroll. Da solo non basta: su una pagina con sezioni pinnate va agganciato a ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)` + Lenis avanzato dal ticker di GSAP), altrimenti i due contano i frame separatamente e le scene pinnate vibrano. Il `SmoothScroll` di `components/landing/smooth-scroll.tsx` **non** lo fa; `components/landing/v2/smooth-scroll.tsx` sì.

Questa sezione diceva il contrario fino ad agosto 2026 — «GSAP and ScrollTrigger are not installed and have never been used here» — mentre `gsap` era in `package.json` da mesi e quattro scene della home lo usavano in produzione. Verificare in `package.json` prima di affermare che una libreria non c'è: è lo stesso principio che vale per il resto del repository.

Motion must support storytelling. Do not animate everything. Prefer 2 or 3 high-impact scroll-driven moments rather than dozens of small animations.

Respect `prefers-reduced-motion`. Motion must remain smooth on mobile and low-power devices.

## Brand feeling

The user should feel:

"This is a new way of approaching mental performance in sport."

NOT:

"This is another SaaS platform."

## Final check

Before completing any KaiPai marketing UI, ask internally:

- Does this look like a template?
- Could this section belong to any SaaS?
- Are there too many cards?
- Is the message understandable in 3 seconds?
- Is there enough whitespace?
- Is there a clear visual hierarchy?
- Is motion telling a story or merely decorating?
- Does it feel connected to sport?

If a section could easily belong to another generic SaaS, redesign it.

## Related skills

- `web-creative-director` — establishes the art direction **before** this skill applies the brand to it
- `frontend-design` — general craft for distinctive interfaces
- `vercel-react-best-practices` — React 19 / Next 15 implementation on the web (not for `mobile/`, which is React 18)
