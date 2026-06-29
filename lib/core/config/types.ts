/**
 * Vertical configuration contract (Phase 1).
 *
 * Core is vertical-agnostic: it knows about users, roles, profiles, providers,
 * clients, services, listings, bookings and organizations — never about sports,
 * mental coaching, athletes or clubs by name. A vertical injects all of that
 * domain knowledge through a single `VerticalConfig` object consumed by core at
 * boot (label rendering, listing filters, role keys, and — later — validation).
 *
 * No SMC-specific identifiers may appear in this file.
 */

/** A single, selectable taxonomy entry referenced elsewhere by its `key`. */
export type TaxonomyItem = {
  /** Stable machine key persisted in the DB (e.g. on provider/client profiles). */
  key: string;
  /** Human-facing label for the current locale. */
  label: string;
  /** Optional longer description for tooltips / onboarding hints. */
  description?: string;
};

/** A role definition: the stable `key` matches a row in the `roles` table. */
export type RoleDef = {
  /** Must match a seeded key in `roles` (e.g. athlete / coach / club / admin). */
  key: string;
  /** Vertical-facing label shown in the UI. */
  label: string;
};

/**
 * The four marketplace-standard roles, mapped to vertical-specific keys/labels.
 * `client`, `provider` and `organization` are the generic marketplace actors;
 * `admin` is the platform operator (same across verticals, label overridable).
 */
export type VerticalRoles = {
  client: RoleDef;
  provider: RoleDef;
  organization: RoleDef;
  admin: RoleDef;
};

/** Domain taxonomies a vertical supplies for profiles, filters and listings. */
export type VerticalTaxonomies = {
  /** Top-level categories — e.g. sports. Used as listing filters. */
  categories: TaxonomyItem[];
  /** Provider focus areas — e.g. mental-coaching specialties. */
  specialties: TaxonomyItem[];
  /** Optional client levels — e.g. amateur / pro. */
  levels?: TaxonomyItem[];
};

/**
 * Supported UI locales for a vertical. Phase 1 ships Italian; the union is kept
 * open-ended enough to add locales without changing the contract.
 */
export type VerticalLocale = 'it' | 'en';

/**
 * The single object a vertical module exports. Core depends only on this shape.
 *
 * `validation` (per-entity Zod schemas extending core base schemas) is added
 * together with the onboarding flow; it is intentionally omitted in Phase 1.
 */
export type VerticalConfig = {
  /** Stable vertical id, e.g. 'sport-mental-coach'. */
  id: string;
  /** Default locale for `copy` and taxonomy labels. */
  locale: VerticalLocale;
  /** Role key/label mapping for this vertical. */
  roles: VerticalRoles;
  /** Domain taxonomies (categories, specialties, levels). */
  taxonomies: VerticalTaxonomies;
  /** Flat map of UI strings (microcopy, headings, CTA labels). */
  copy: Record<string, string>;
};
