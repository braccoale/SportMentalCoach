# Kai Pai — Art Direction (Media Assets)

> The visual bible for every photographic asset on Kai Pai. If a picture doesn't obey this document, it doesn't ship. One brand, one atmosphere, one feeling: **premium, cinematic, serious, emotional.**
> Companion to `09_Landing_Creative_Spec.md` (design system) and the `ImageSlot` component. All copy/claims must respect the trust rules — no fake logos, no real club brands, no misleading performance claims baked into imagery.

---

## 0 · The one-line brief
> *A dark stadium at night. One athlete, alone with their mind. A single red light finds them.*

Every image is a still from the same film. If two assets look like they came from different photographers or different stock libraries, we've failed.

---

## 1 · Photographic style
- **Editorial sports portraiture**, not advertising, not stock. Think a serious documentary about the inner life of an athlete — closer to a film poster than a brochure.
- **Real, imperfect skin and texture.** Visible pores, sweat, stubble, breath in cold air. Authenticity > polish.
- **Shallow depth of field** isolating the subject from a deep, dark environment.
- **Single-subject discipline.** One person per frame (except CTA, which may show a lone figure from behind facing a crowd). No group grins.
- **Moments between the action** — the pause before the free kick, the walk through the tunnel, the stare, the recovery of breath. Not the celebration, not the goal.

## 2 · Lighting
- **Low-key, chiaroscuro.** ~70% of the frame falls into shadow. Light is sculpted, never flat.
- **Key light:** a single hard rim/edge light (cool white, ~5000–5600K) carving the profile and shoulder against black.
- **Accent light:** a **red practical** (`#E11D2A` → `#F5333F`) as the *only* saturated color — a rim on the far cheek, a neural glow over the head, floodlight bleed, or bokeh in the deep background. Red is rare and intentional; it points, it doesn't wash.
- **No fill / minimal fill.** Let shadows go deep and clean. Negative space is the luxury.
- **Motivated sources:** stadium floodlights, tunnel strip lights, phone/scoreboard glow — always plausible in a real venue.

## 3 · Color grading
- **Palette = "Ink & Scarlatto":** near-black desaturated base (cool `#050507`), off-white highlights (never clipped pure white), one disciplined red accent.
- **Desaturate everything except the red.** Skin stays neutral-cool, greens of the pitch muted to near-grey, kit desaturated. The red is the loudest thing in the frame — by a mile.
- **Lifted-but-clean blacks:** deep, slightly cool shadows with detail retained (no crushed muddy black, no milky lift).
- **Filmic tone curve:** gentle highlight roll-off, contrasty mids. Think teal-less "orange & black" but with red replacing orange.
- **Fine 35mm grain** overlaid, subtle vignette. Cinematic, not gritty-Instagram.

## 4 · Lens look
- **Focal length:** 50mm–85mm (portraits), 35mm for environmental/tunnel context. Never wide-angle distortion on faces.
- **Fast aperture** (f/1.4–f/2.8) → creamy background separation, round bokeh from distant floodlights.
- **Anamorphic hints welcome:** subtle horizontal flares on the red source, oval bokeh, slight edge softness. Cinematic, not gimmicky.
- **Full-frame / cinema-camera character**, high dynamic range, natural micro-contrast.

## 5 · Contrast & texture
- **High local contrast, controlled global contrast.** The subject reads instantly; the world recedes.
- **Texture is the point:** sweat, breath vapour, fabric weave, grass blades catching a single light, condensation.
- Blacks are a *material*, not an absence — they should feel velvet, deep, expensive.

## 6 · Subject positioning (must match the `ImageSlot` crops)
- **Hero (`hero-athlete.jpg`)** — subject on the **right third**, facing left/into-frame (profile or 3/4), head in the upper portion (the neural glow sits over the head). Left side falls into darkness so the headline reads over it. Vertical/portrait bias.
- **Founder (`founder-francesco.jpg`)** — **4:5 portrait**, head in the upper-center, eyeline just above center, space to breathe. Calm, direct, grounded.
- **Coach (`coach-marco.jpg`)** — **square**, head-and-shoulders centered, confident and approachable-but-serious (not smiling for the camera).
- **CTA (`cta-athlete.jpg`)** — **wide/landscape**, lone figure **from behind**, lower-center, walking toward tunnel light or an out-of-focus crowd; lots of dark headroom for the headline. Subject positioned off a centered composition is fine (rule of thirds).

## 7 · Background style
- **Deep, dark, real sport environments:** floodlit pitch at night, players' tunnel, empty stadium stands in shadow, locker room in low light, training ground at dusk.
- **Always out of focus** and desaturated — context, never clutter.
- Red only appears as distant light/bokeh or accent, never as painted set decoration.
- **Believable Italian / European football context:** European stadium architecture, generic dark kit, natural venue — but **no identifiable club crests, sponsor boards, competition logos, or trophies.** Keep all kit and signage plain/blank.

## 8 · Emotional tone
- **Focus. Composure. Quiet resolve.** The feeling of a mind under control before pressure.
- **Introspective, not triumphant.** No fist-pumps, no shouting, no crowd-surfing. The drama is internal.
- **Dignified and human** — especially for the founder (trustworthy, sincere) and for anything implying minors (see §9).
- The viewer should feel: *"These people are serious. I trust them."*

## 9 · What to avoid (hard no's)
- ❌ Stock-photo energy: posed high-fives, thumbs-up, laughing-at-nothing, white cyclorama studios.
- ❌ Generic smiling people, teeth-forward "corporate happy."
- ❌ Bright, flat, daylight, high-key, pastel, or warm-orange Instagram grading.
- ❌ Oversaturated colors competing with the red; rainbow kits; blue/teal cinematic clichés.
- ❌ Real club crests, sponsor logos, league/competition marks, recognizable trophies, or real player likenesses.
- ❌ Any on-image text, numbers, stats, or performance claims (the UI supplies those — and they must be truthful).
- ❌ Fake "neural/AI" HUD clutter, sci-fi holograms, cheesy brain diagrams. The only "tech" cue is the tasteful red **glow**, nothing literal.
- ❌ Minors depicted in emotionally distressing, clinical, or exploitative ways. If a youth subject is shown, keep it dignified, calm, fully clothed in training gear, non-identifying.
- ❌ Plastic skin, over-retouching, HDR halos, warped hands/faces (AI tell-tales) — cull anything uncanny.
- ❌ Extreme wide-angle face distortion, tilted "dutch" gimmickry.

## 10 · Delivery specs
- **Format:** JPG or WebP, sRGB, high quality. Provide a 2× resolution master per slot.
- **Suggested resolutions:** hero ≥ 1600×2000; founder ≥ 1200×1500 (4:5); coach ≥ 1000×1000 (1:1); cta ≥ 2400×1350 (16:9).
- **Leave the darkness in-camera/in-grade** — don't rely on the CSS scrims alone; the asset itself should already be dark on the text side.
- File names exactly: `hero-athlete.jpg`, `founder-francesco.jpg`, `coach-marco.jpg`, `cta-athlete.jpg` → `public/`.
- Keep a consistent grade across all four (same LUT/curve) so they read as one set.

---

## 11 · Generation prompts

> Use with any high-end image model. Keep the **shared style suffix** identical across all four so the set matches. Replace only the scene. Add your model's quality tokens as needed. Do not add logos, text, or claims.

**SHARED STYLE SUFFIX (append to every prompt):**
```
cinematic editorial sports photography, low-key chiaroscuro lighting, single hard cool-white rim light,
one deep red accent light (#E11D2A) as the only saturated color, desaturated near-black background,
shallow depth of field, 85mm look, f/1.8, subtle anamorphic flare, fine 35mm film grain, gentle vignette,
filmic tone curve, deep clean blacks, high local contrast, real skin texture, photorealistic, moody, premium,
serious and introspective mood — NOT stock photo, no smiling to camera, no on-image text, no logos,
no club crests or sponsors, plain unbranded dark kit, believable European football setting
```

### 1 · `hero-athlete.jpg` — the mind under the lights
```
Close profile portrait of a focused young male football (soccer) athlete at night in a dark floodlit
European stadium, sweat and faint breath vapour on skin, head slightly lowered in concentration, eyes
calm and intense, looking into frame to the left. Subject placed on the RIGHT side of a vertical frame,
head in the upper portion; the LEFT side falls into deep darkness (empty space for text). A soft red
neural glow hovers subtly around the head/temple area (an abstract halo of light, NOT a literal brain or
HUD). Cool rim light carves his profile against black; distant red floodlight bokeh in the background.
Portrait orientation. [SHARED STYLE SUFFIX]
```

### 2 · `founder-francesco.jpg` — the man behind the method
```
Dignified editorial portrait of a 45–55 year old Italian man, mental performance coach and founder,
short greying hair, few days of stubble, calm confident expression, direct sincere eye contact, wearing
a simple dark jacket or knit. 4:5 vertical framing, head in the upper-center, eyeline just above center.
Dark, softly out-of-focus training-ground or indoor facility at dusk behind him; a single cool key light
from one side, a faint red accent light on the shadow side. Trustworthy, grounded, human — the face of a
serious method, not a celebrity. [SHARED STYLE SUFFIX]
```

### 3 · `coach-marco.jpg` — a coach you'd trust your kid with
```
Square head-and-shoulders portrait of a 30–40 year old Italian mental coach, athletic build, plain dark
technical training top, composed and approachable-but-serious expression (calm, not smiling for the
camera), arms relaxed. Centered composition, 1:1. Dark blurred sports facility background (indoor pitch or
gym in low light) with a subtle red light accent in the far background. Cool rim light on one shoulder and
cheek. Professional, warm-but-focused, credible. [SHARED STYLE SUFFIX]
```

### 4 · `cta-athlete.jpg` — no one becomes a champion alone
```
Wide cinematic shot of a lone football (soccer) athlete seen FROM BEHIND, silhouette lit at the edges,
walking toward a bright players'-tunnel exit or an out-of-focus floodlit stadium crowd at night. Figure in
the lower-center of a 16:9 landscape frame with large dark headroom above (empty space for a headline).
Volumetric light and haze ahead of him, a red glow bleeding from the tunnel/stadium lights, deep shadows
all around. Epic, emotional, solitary, hopeful. Plain unbranded dark kit, no visible faces, no crests.
[SHARED STYLE SUFFIX]
```

---

## 12 · QA checklist (before an asset goes in `public/`)
- [ ] Reads as the **same film** as the other three (grade, contrast, red accent match).
- [ ] Red is the **only** saturated color and is used sparingly.
- [ ] Dark side is genuinely dark **in the asset** (not relying on CSS scrim).
- [ ] Subject positioned for its slot crop (see §6) — nothing important where the UI overlays sit.
- [ ] No smiling-to-camera, no stock energy, no HUD/brain clichés.
- [ ] **No logos, crests, sponsors, competition marks, real players, or on-image text.**
- [ ] No AI tells (hands, teeth, warped ears, plastic skin). Dignified depiction, especially any youth subject.
- [ ] Exported at the target resolution with the exact filename.
