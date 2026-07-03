# Kai Pai — Landing Creative Spec (v2, build-ready)

> The single source of truth for the public landing. Consolidates the original creative spec + the design-review rewrites (`10_Landing_Design_Review.md`).
> All user-facing copy in **Italian**; all direction in English. **No code until the two gates are cleared** (see end).

**The idea we are selling:** *Kai Pai is the operating system for mental performance in sport.* Today everyone trains the body; tomorrow everyone will train the mind. Kai Pai exists to accelerate that shift. The marketplace is the **proof**, not the pitch.

**Enemy:** stigma + the outdated belief that talent is physical.

**Five emotional exits:** Athlete → *"voglio diventare più forte di testa"* · Parent → *"di loro mi fido"* · Coach → *"voglio entrare in Kai Pai"* · Club → *"dovremmo lavorare con loro"* · Investor → *"è molto più di un marketplace."*

**Design creed:** (1) silence sells — vast black, few words; (2) cinema not brochure; (3) red is rare (<10% of any viewport); (4) motion means something (the circle completes, the network connects, the seal stamps, the layers assemble); (5) trust compounds per scroll.

---

## 1 · Design System — "Ink & Scarlatto"

### Color
| Token | Value | Use |
|---|---|---|
| `ink-1000` | `#050507` | Page base |
| `ink-900` | `#0A0A0D` | Alt sections |
| `ink-800` | `#121217` | Card/surface base |
| `line` | `rgba(255,255,255,.08)` | Hairline borders |
| `text-hi` | `#F4F4F6` | Headlines |
| `text-mid` | `#9A9AA6` | Body |
| `text-low` | `#5E5E6B` | Captions / neutral eyebrows |
| `red-600` | `#E11D2A` | Brand red — CTA, key accent word |
| `red-500` | `#F5333F` | Hover / glow edge |
| `red-glow` | `rgba(225,29,42,.35)` | Radial halos |
| `red-950` | `#3A080D` | Deep gradient base |
| `verify` | `#34D399` | Verified badges (green = trust) |

Grain overlay 3–4% everywhere. Depth via light, not heavy shadows.

### Typography
- **Display:** PP Neue Montreal / *fallback* General Sans — `clamp(2.75rem, 8vw, 6.5rem)`, 700–800, tracking `-0.03em`, LH `0.95`.
- **Heading:** same, `clamp(1.9rem, 4.5vw, 3.75rem)`, 600.
- **Body:** Inter variable — `1.0625–1.1875rem`, LH `1.6`, `text-mid`.
- **Eyebrow/label:** Geist Mono / JetBrains Mono — `0.8125rem`, uppercase, tracking `0.14em`.
- **Stat:** Display/Mono, `tabular-nums`.
Signature: mono uppercase eyebrows + heavy 2-line display headlines with the key word in red.

### Spacing / grid / shape
4px base; scale 4·8·12·16·24·32·48·64·96·128·160·200. Section padding 96 mobile → 160–200 desktop. Grid: 12-col (max 1200, 80 margins) / 8-col tablet / 4-col mobile. Radius: sm12·md16·**card20**·xl28·pill999.

### Elevation / components / motion
- Elevation: borders + glow; `shadow-card 0 30px 80px rgba(0,0,0,.55)`; `glow-red 0 0 40px red-glow`; inset top highlight on cards.
- Button/Primary: red gradient pill, magnetic (±6px), glow, sliding `→`. Secondary: ghost, `line`, backdrop-blur. Link: wipe underline.
- Card/Glass: `bg white/4%`, `line` border, r20; hover → red/40% border + glow + 4px lift + ≤2° tilt.
- Badge: pill icon+label (verified = green). Stat chip: `tabular-nums` + mono label, count-up. Input: 44px+, `ink-800` fill, red focus glow, floating label, r12.
- Motion tokens: `ease-expo cubic-bezier(0.16,1,0.3,1)`; durations fast .2 / base .5 / slow .8 / cinematic 1.2; **reveal** = opacity 0→1, y 24→0, blur 8→0, .7s expo, stagger .08; viewport `once:true, margin:-15%`. Every reveal is blur+rise. `useReducedMotion` kills parallax/tilt/spotlight. Lenis smooth-scroll; red 2px scroll-progress bar; desktop spotlight cursor (off on touch/reduced-motion).
- Breakpoints: `sm375 · md768 · lg1024 · xl1280 · 2xl1536`. Mobile-first; desktop adds theatre.

### Iconography / imagery
Thin 1.5px line icons on 24px grid. Illustration = neural data-viz only (nodes, lines, glow). Photography: cinematic, dark, monochrome + red rim, real faces, grain + vignette. `next/image` AVIF/WebP + LQIP.

---

## 2 · Narrative spine (final order — 16 beats)

1. **Hero** — declaration (not errand)
2. **Problem** — name the enemy
3. **Method** — the IP: *I 4 Muscoli della Mente*
4. **Origine (Founder)** — the person who started it
5. **Ecosystem** — the world it connects
6. **Marketplace** — proof (demoted; outcome-led, no feature bento)
7. **Academy** — the quality standard (echoed system-wide)
8. **Results** — real transformations
9. **Trust** — safe & serious (verification, minors, GDPR)
10. **How it Works** — 3 steps (absorbs the software line)
11. **Vision** — assembling layers (the OS)
12. **Movimento (Community)** — manifesto + movement wall
13. **Content band** — "La cultura della mente" (low weight)
14. **Final CTA** — join the movement

Each beat closes one objection and opens the next: *outdated belief → a person who refused it → a Method → available to all → a world → proof → safe → bigger → belong → join.*

---

## 3 · Section briefs

Per section: *Goal · Objection removed · Emotion · Copy (IT) · Layout D/T/M · Motion · Why it converts.*

### 01 · HERO — declaration
- **Goal:** authority + desire in 3s. **Objection:** "is this serious?" **Emotion:** awe + belonging.
- Eyebrow `L'ALLENAMENTO CHE MANCAVA` · Headline **"Alleni il corpo da sempre. È ora della mente."** *(alt: "Il talento è fisico. Il campione è mentale.")* · Sub *"Kai Pai è il metodo, la scuola e la rete di coach che allenano la mente di chi fa sport. Perché allenare la testa diventi normale quanto allenare il fisico."* · CTA **Trova un Coach →** + **Scopri il Metodo Kai Pai ▸** + *Guarda il film (1:30)* · Trust row `coach verificati · atleti in allenamento · società partner` (movement signals, not invented %).
- **Layout:** D split (text left, backlit athlete + neural glow bleeding right) / T subject as bg + text overlay / M subject top, stacked full-width CTAs, chips horizontal scroll.
- **Motion:** word-by-word blur-reveal headline; subject scale 1.06→1 + mouse parallax; neural path-draw; chips count-up; grain drift. Magnetic CTA; spotlight follows cursor.
- **Why:** peak desire + credibility at the decision moment; dual CTA serves B2C & B2B; the Method CTA now means something.

### 02 · PROBLEM — name the enemy
- **Goal:** create the gap. **Objection:** "do I need this?" **Emotion:** recognition.
- Eyebrow `IL GIOCO È CAMBIATO` · Headline **"Nello sport alleniamo tutto. Tranne la testa."** · Villain line *"Per troppo tempo allenare la mente ha voluto dire 'qualcosa non va'. È l'idea più sbagliata dello sport moderno."* · Trio: **Tecnica** ("la base, non basta") · **Fisico** ("il motore, la mente lo guida") · **Mente** ("il vero vantaggio").
- **Layout:** centered title → 3 cards, **Mente** lit (border + "il vero vantaggio" label, not color-only) / T 3 across / M stacked, Mente last & lit.
- **Motion:** a **ring** behind draws and completes exactly as Mente lights; cards blur-reveal stagger; hover lights one, dims others.
- **Why:** installs the need before the cure; declares war on the stigma.

### 03 · METHOD — the IP: *I 4 Muscoli della Mente*
- **Goal:** turn "coach" into a nameable framework. **Objection:** "just a random coach?" **Emotion:** confidence in a system.
- Eyebrow `IL METODO` · Headline **"Il Metodo Kai Pai: i 4 muscoli della mente."** · Sub *"La mente è un muscolo. Si allena."*
- The four muscles:
  | Muscolo | Allena | Frase atleta |
  |---|---|---|
  | **Lucidità** | focus, presenza | *"restare nel presente"* |
  | **Calma** | pressione, ansia, emozioni | *"freddezza nei momenti caldi"* |
  | **Fiducia** | autostima, coraggio di sbagliare | *"giocare senza paura"* |
  | **Identità** | carattere, resilienza | *"chi sei quando perdi"* |
- Loop: **Misura → Alza → Ripeti** (the "Kai"≈kaizen soul — a practice, not a cure). Close: *"Noi ti alleniamo ad usarla."*
- **Signature graphic:** a **4-point diamond/radar ("Mappa Mentale")** — the recurring brand motif (appears on coach cards, in-app, merch). Icons: lens (Lucidità), still-water/heartbeat (Calma), rising figure (Fiducia), fingerprint (Identità).
- **Vocabulary that spreads:** *Mappa Mentale · Mental Rep · Carico Mentale · Percorso.*
- **Layout:** D — diamond center, points draw one-by-one as each muscolo is named; loop rings the diamond; "flex" pulse on the word *muscolo*. T — diamond + stacked labels. M — vertical list, mini-diamond.
- **Why:** proprietary, teachable, repeatable IP = the difference between a marketplace and a category. *Single biggest category lever.*

### 04 · ORIGINE (Founder) — the person
- **Goal:** convert "software" → "belief." **Objection:** "who's behind this / why?" **Emotion:** credibility through conviction.
- **Who he really is (from public sources — LinkedIn/francescoborrelli.com/Antea Edizioni):** **Francesco Borrelli** — Mental Coach **certificato ACSI–CONI**. Laurea in Giurisprudenza (Università di Genova); ex giornalista sportivo, poi consulente in ambito bancario. Nel **2014** scopre la PNL (in Italia e all'estero) e cambia strada, diventando Mental Coach. Da anni affianca **atleti verso Olimpiadi e Mondiali** e **calciatori di ogni età, dal settore giovanile all'esordio tra i professionisti**. Autore di due libri (*"Childlike – Come un bimbo"*, *"Best Before"*, Antea Edizioni). Progetto professionale: *Brain2Gain*. Filosofia reale: *allenare la mente = guidare la relazione mente-corpo, invece di subirla; riconoscere le differenze e trasformarle in coesione, performance, benessere.*
- Eyebrow `L'ORIGINE` · Headline **"Tutto è iniziato da una convinzione."** · Body (first-person, ~45 words, grounded in the real story): *"Vengo dal diritto, dal giornalismo, dalla consulenza. Nel 2014 ho scoperto che la mente si allena — e ho cambiato strada. Da allora accompagno atleti verso Olimpiadi e Mondiali, e ragazzi dal settore giovanile all'esordio tra i professionisti. Ho imparato una cosa sola: la mente non va corretta, va guidata."* — signed **Francesco Borrelli**, *Fondatore · Ideatore del Metodo Kai Pai · Mental Coach certificato ACSI–CONI.*
- Pull-quote (huge): **"Non farti guidare dalla tua mente. Impara a guidarla."** *(alt: "Il talento apre le porte. È la mente che le tiene aperte.")*
- Credibility chips beside the portrait: `Certificato ACSI–CONI` · `Autore` · `Al fianco di atleti olimpici e calciatori pro`.
- Micro-CTA *Leggi il manifesto → / Guarda il racconto (2 min).*
- **Visual:** one editorial cinematic portrait (backlit, half-shadow, real, black bg, grain). Optional 2-min talking-head film w/ captions (highest-converting asset). *Source real portrait — do not use stock.*
- **Motion:** portrait clip-path wipe (top-down, 1.2s expo); pull-quote types/blurs word-by-word; signature "writes" itself (SVG path). **Stillness = sincerity** — no parallax circus here.
- **Guardrail:** prophet of the idea, not a guru/influencer. ≤45 words body + one quote. Lead with the *conviction*, keep the CV to the chips.
- **Why:** faceless platforms are trusted less (esp. with minors). A named, accountable human with real Olympic/pro credentials = oldest trust signal + narrative defensibility competitors can't copy.

### 05 · ECOSYSTEM — the world
- **Goal:** 1-to-1 service → protective network. **Objection:** "just me and a coach?" **Emotion:** belonging, safety-in-numbers.
- Eyebrow `L'ECOSISTEMA` · Headline **"La mente non cresce da sola."** · 4 nodes (Atleta / Allenatore / Famiglia / Società) w/ keywords.
- **Layout:** D constellation (center = athlete/#10 from behind; drawn, pulsing links) / T simplified radial / M vertical role-cards joined by a line.
- **Motion:** path-draw links + traveling light; nodes stagger-in; hover a node highlights its links. Keep it **emotional, not diagrammatic** (art direction load-bearing).
- **Why:** speaks to all four audiences at once; raises perceived value (platform, not tool).

### 06 · MARKETPLACE — proof (demoted)
- **Goal:** tangible, high-quality proof without going technical. **Objection:** "does it work?" **Emotion:** reassurance.
- Eyebrow `LA PIATTAFORMA` · Headline **"Il coach giusto per la tua testa."** (outcome, not toolset) · one line of proof: *Coach verificati · Recensioni verificate · Formati dall'Academy.*
- **Kill:** the app-screenshot bento; "prenotazione/chat/video" as a headline.
- **Keep:** one beautiful verified coach card (identity badge + Academy seal + ★ + Mappa Mentale motif).
- **Layout:** single floating coach card, 3D tilt on hover, green badge stamp / T same, tighter / M card hero.
- **Why:** turns promise into product proof, lowers risk — while selling *transformation*, not software.

### 07 · ACADEMY — the standard (echoed everywhere)
- **Goal:** present Academy as the quality engine behind every coach (not a course). **Objection:** "can I trust these coaches?" **Emotion:** confidence via selection.
- Eyebrow `KAI PAI ACADEMY` · Headline **"Non scegliamo i coach. Li formiamo."** · Funnel: *Selezione → Formazione → Certificazione → Supervisione → Crescita continua* → **Coach Verificato Kai Pai** seal. Micro-claim *"Solo chi supera ogni fase entra nel network."*
- **System echo:** the Academy seal appears on every coach card site-wide; the Method flows *from* the Academy.
- **Motion:** progress fills steps; the **seal stamps** (scale-in + glow + micro-shake) — a dopamine beat.
- **Why:** selectivity is the strongest trust builder for entrusting a minor; makes coaches *want in* (fuels supply). Prominent everywhere, **hero nowhere** (emotion leads, Academy substantiates).

### 08 · RESULTS — real transformations
- Eyebrow `STORIE VERE` · Headline **"Risultati reali. Persone vere."** · sourced stat count-ups + testimonials (Atleta U17 · Allenatore · Genitore · Società) + one mini case study framed as a *transformation* (before/after Mappa Mentale).
- **Layout:** stat row → testimonial marquee (pausable) → featured case study. Real faces, with consent.
- **Why:** social proof = top conversion lever; removes "will it work for me."

### 09 · TRUST — safe & serious
- Eyebrow `SICUREZZA E FIDUCIA` · Headline **"La fiducia non è un dettaglio. È il progetto."** · 4 pillars: *Identità verificata · Professionisti certificati · Recensioni verificate · Tutela dei minori & GDPR* + *"Supporto umano, sempre."* + note *"Il mental coaching non sostituisce un percorso clinico."*
- **Motion:** a shield assembles; calm reveal. Highest-contrast section; plain language; note visible not hidden.
- **Why:** decisive for parents/clubs; placed before the final ask closes the biggest objection.

### 10 · HOW IT WORKS — 3 steps (absorbs the software)
- Eyebrow `IN TRE PASSI` · Headline **"Scegli. Prenota. Cresci."** · 1 *Scegli il coach giusto* · 2 *Prenoti la sessione* · 3 *Inizi il percorso.* · Quiet software line (folded here): *"Prenoti, parli in chat, ti alleni in videochiamata — tutto in un posto."*
- **Motion:** connecting line draws across; giant `01·02·03` parallax.
- **Why:** perceived simplicity increases clicks; the software becomes reassurance, not pitch.

### 11 · VISION — the operating system (assembling layers)
- **Goal:** sell the future. **Objection:** "is this just a product?" **Emotion:** inevitability.
- Eyebrow `LA VISIONE` · Headline **"Il marketplace è solo l'inizio."** · Sub *"Stiamo costruendo l'infrastruttura della performance mentale nello sport."*
- **The visual = the section:** layers that **assemble on scroll**, each locking on top of the previous:
  1. **Il Metodo** — il linguaggio comune *(foundation)*
  2. **Il Marketplace** — l'accesso ai coach *(oggi)*
  3. **L'Academy** — lo standard di qualità *(oggi)*
  4. **La Mappa Mentale** — misurare la crescita nel tempo *(prossimo)*
  5. **Le Società** — l'infrastruttura mentale dei club *(prossimo)*
  6. **La Cultura** — rendere l'allenamento mentale normale *(la missione — glows, never "completes")*
- **Tone rule:** no AI/disrupt/revolutionize. Plain Italian nouns. Understatement = credibility.
- **Why:** "small today" reads as "early, on purpose." Investors buy layers 3–6; ambitious coaches/clubs want in now.

### 12 · MOVIMENTO (Community) — belonging
- **Goal:** transaction → identity. **Objection:** "is this just a booking?" **Emotion:** belonging, pride.
- Eyebrow `IL MOVIMENTO` · Headline **"Non alleni solo la mente. Cambi una cultura."** · Manifesto (huge editorial type, Nike-style):
  > *Alleniamo la mente. / Non aspettiamo di stare male per iniziare. / La pressione non ci spaventa: la alleniamo. / Perdere fa parte. Arrendersi no. / Il talento è un inizio, non una scusa. / Questo è Kai Pai.*
- **Visual:** dignified **movement portrait wall** (real athletes/parents/coaches/club crests), monochrome + occasional red, documentary-opening feel — not a testimonials grid.
- **Motion:** manifesto lines reveal one at a time (blur-rise, drumbeat); face-wall drifts (parallax) behind.
- **Why:** people commit to identities, not platforms; belonging drives retention + word-of-mouth.

### 13 · CONTENT BAND — "La cultura della mente" (low weight)
- Eyebrow `RISORSE & RICERCA` · Headline **"Stiamo cambiando come si pensa lo sport."** · cards: **Podcast** · **Guide per genitori** · **Risorse per le società** · **Ricerca & metodo.** · CTA *Esplora →*
- Placement: after Academy or near footer, low visual weight — a credibility whisper + top-of-funnel entry, not a blog.

### 14 · FINAL CTA — join the movement
- Founder echo above: *"Rendere l'allenamento mentale normale quanto quello fisico."* · Headline **"Il futuro dello sport si allena anche con la testa."** → *"Inizia il tuo percorso. Entra nel movimento."* · CTA **Trova un Coach →** + **Scopri il Metodo** · discreet B2B doors *Sei un coach? · Sei una società?*
- **Visual:** full-bleed cinematic — athlete toward the stadium-tunnel light; breathing red glow. **Peak-end.**
- **Why:** the last emotion drives the click and is what people remember.

---

## 4 · Global systems
Nav (transparent → condense; `Inizia ora` always visible; mobile full-screen overlay). Sticky mobile CTA after hero. Company-grade footer (payoff + 4 columns + socials + legal + IT/EN toggle). Cross-cutting: Lenis, red scroll-progress, global grain, desktop spotlight cursor, consistent `SectionHeader`.

## 5 · Performance · SEO · A11y
- **CWV:** `next/image` AVIF+LQIP, hero `priority` only; video lazy + poster, muted/inline, ≤1.5MB; Framer Motion on transform/opacity; lazy-mount below-fold; font `display:swap` + preload display face; grain as CSS/SVG. Budgets **LCP <2.5s · CLS <0.1 · INP <200ms · Lighthouse ≥90.**
- **SEO:** SSR/SSG, curated title/OG/Twitter, JSON-LD Organization+Service, clean headings, indexable copy (no text-in-image), hreflang IT/EN, sitemap.
- **A11y AA:** contrast ≥4.5:1, visible focus, all motion behind `prefers-reduced-motion`, landmarks, narrative alt, captions, no color-only meaning, keyboard-complete (nav, accordions, carousels, pinned Method/Vision fallbacks).

## 6 · Discipline rules (self-review enforced)
1. Every number ships with a real source, or is replaced by platform metrics.
2. Red < 10% of any viewport.
3. One signature effect per section.
4. Photo/film direction is budget line #1 — gate on "moodboard + 10 hero frames" before build.
5. Validate hero clarity with a 5-second test.
6. Decide brand color now: red as the new Kai Pai identity (and align the app) vs standalone campaign chapter.

## 7 · Numbers (PLACEHOLDER — invented, replace before public launch)

> ⚠️ These are **provisional, invented** figures used to design and build. They read as plausible movement/traction signals. **Every one must be replaced with a real, sourced value before the site goes public** — invented stats on a product for minors are a trust/legal risk. Keep the *shape*, swap the *value*.

**Hero trust row (movement signals, not %):**
- `80+` Mental Coach verificati
- `1.500+` atleti in allenamento
- `30+` società partner
- `4.9★` valutazione media

**Results / proof stats:**
- `+34%` gestione della pressione *(percepita, auto-riportata)*
- `92%` degli atleti consiglia il proprio coach
- `2.400+` sessioni completate
- `18` regioni coperte

Rule still holds: at launch each number carries a source label, or is swapped for a hard platform metric.

## 8 · Gate cleared / remaining
1. ✅ **Founder story** — sourced from public profiles and written into Section 04 (real portrait/film still to be produced; **do not use stock**).
2. ✅ **Numbers** — invented placeholders above (to be replaced with real values before launch).

Ready to build section by section (tokens → Hero → down), mobile-first, Framer Motion, within the performance budget — pending the brand-color decision (red as the Kai Pai identity vs standalone campaign).
