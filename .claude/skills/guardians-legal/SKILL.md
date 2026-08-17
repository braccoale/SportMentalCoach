---
name: guardians-legal
description: "Use for ANY work touching minors, parental authorisation, legal documents or consent evidence. Triggers: athleteGuardians, guardianInvitations, agreementAcceptances, guardian token, 'tutore', 'genitore', 'minore', 'maggiorenne', birth date or age checks, terms acceptance, privacy policy, sub-processors, revoking authorisation, blocking an athlete from booking. Read this BEFORE changing an age threshold, a consent text, or who is allowed to do what."
---

# Tutori, minori e prove di consenso

The area where a mistake does not produce a bug: it produces a minor in a therapy-adjacent session without valid parental authorisation, or a legal document the platform cannot prove was ever accepted.

Two properties make this different from the rest of the codebase:

- **The evidence is the product.** Not the current state — the history. "They accepted" is worth little without "this exact text, at this moment".
- **The law fixed the numbers, not us.** Do not adjust a threshold to make a flow smoother.

## The two ages, and where they come from

`lib/core/guardians/age.ts` — a plain module, deliberately *not* `server-only`, so the signup form and the server action validate against the same constants.

| | value | why it is that number |
|---|---|---|
| `MIN_SIGNUP_AGE` | **15** | the product's own floor, above Italy's digital-consent age of 14 (art. 2-quinquies D.Lgs. 196/2003) — so every user can validly consent to their own data processing |
| `AGE_OF_MAJORITY` | **18** | legal capacity (art. 2 c.c.); below it a contract is voidable (art. 1425 c.c.), and the Terms are a contract |

**Only the 15–17 band needs a guardian.** Under 15 signup is refused outright; at 18 nothing is required.

`ageFromBirthDate` returns `null` for a missing or unparseable date — never 0. An unknown age is its own case and callers must handle it, because "we do not know how old they are" and "they are a newborn" must not collapse into the same branch.

## One gate, asked fresh every time

`getGuardianStatus` returns a closed union: `not_required | missing | pending | confirmed | revoked | unknown_age`. Everything else derives from it.

- `canBookSessions` — booking, video tokens and guest links all call it (aliased `canParticipateInSessions`). It returns a `Result` with an Italian message already written for the athlete.
- `canUseAiNotesForAthlete` — **a separate prerequisite.** A confirmed guardian who authorised the sessions has not necessarily authorised the recording: `aiRecordingAuthorized` is its own flag on the confirmed status.

Never re-derive authorisation from a stored boolean at the call site. Ask the function; it is asked fresh at session entry on purpose, because an authorisation can be revoked between booking and joining.

## The invitation is a hashed token

`tokens.ts`: `issueGuardianToken` returns 32 random bytes base64url; only `hashGuardianToken` (SHA-256) is stored. The plaintext exists in the email and nowhere else. Do not add a column that keeps it, and do not log it.

`signatureMatchesInvite` in `policy.ts` compares the typed signature against the invited guardian's name — NFKC-normalised, whitespace-collapsed, case-folded with `it-IT`, length 3–200. It is the closest thing to a signature check the flow has.

`authorityMatchesRelationship` enforces the pairing: `tutore-legale` requires `legal_guardian`; `madre` and `padre` require anything but. Relationships are `madre | padre | tutore-legale`, authority bases `joint_agreement | sole_responsibility | legal_guardian`.

## Consent text is versioned, and the hash is the evidence

`consent-document.ts` holds the canonical Italian text under `GUARDIAN_CONSENT_VERSION` (currently `2026-08-06.1`). The confirmation page renders exactly that content, and the same SHA-256 is stored with the acceptance.

**Changing one word requires a version bump.** Old evidence must keep pointing at the text that was actually accepted; editing the text in place silently rewrites what past guardians agreed to.

The same discipline covers the platform's own documents: `LEGAL_CONTENT_HASH` in `content-hash.generated.ts` is produced by `scripts/generate-legal-hash.mjs`, regenerated before every build and committed. Never hand-edit it.

## Acceptances are append-only

`recordPlatformTermsAcceptance` always INSERTs into `agreement_acceptances`. Accepting a new version adds a row and leaves the previous one intact — **never update, never delete.** Keys sharing the table: `platform-terms`, `coach`, `guardian-consent`.

`AcceptanceContext` carries `ipAddress`, `userAgent` and `acceptedVexatious` — the specific approval of onerous clauses (artt. 1341-1342 c.c.) required from professionals. It is *recorded*, not merely checked: for a specific approval the proof is the entire point, and a checkbox enforced at signup but not preserved is worth nothing in court.

It takes the caller's transaction so signup writes the acceptance atomically with the account.

## Revocation cascades into the live session

`revocation.ts` is the one that reaches furthest. Revoking a guardian's authorisation stops AI session notes already in flight — `REVOCABLE_AI_STATUSES` covers `waiting_for_consent`, `active`, `processing` — cancels processing jobs, stops the egress, and writes to the AI audit trail.

If you add a state to the AI notes pipeline that holds athlete audio, ask whether revocation must reach it too. A consent that cannot be withdrawn from is not a consent.

## The sub-processor list is code, and it must not lag

`processors.ts` lists every third party that handles personal data, as disclosed in the privacy policy. Deepgram and OpenAI were added when the AI session notes shipped — until then the policy said audio was never recorded, which stopped being true the moment track egress wrote its first file.

**Adding an integration that touches personal data means updating this array and `LEGAL_LAST_UPDATED` in the same change.** A list that lags behind the code is a statement to users that has quietly become false. Stripe is deliberately absent while billing is off.

## Red flags — stop and ask

- Lowering `MIN_SIGNUP_AGE` or `AGE_OF_MAJORITY` for any reason.
- Editing consent text without bumping the version.
- `UPDATE` or `DELETE` on `agreement_acceptances`.
- Storing, logging or emailing a guardian token in plaintext.
- Treating `unknown_age` as `not_required`.
- Reusing the sessions authorisation to justify recording.
- Wiring a new AI-notes state without checking revocation reaches it.

## Related skills

- `ai-session-notes` — where recording authorisation is actually spent, and what revocation must stop
- `booking-scheduling` — the other caller of `canBookSessions`
