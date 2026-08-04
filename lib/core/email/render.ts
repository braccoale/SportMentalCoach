/**
 * The template renderer for database-stored email copy.
 *
 * Threat model: `email_templates` rows are editable content. They must never be
 * able to execute anything or read anything they were not explicitly granted.
 * Therefore the syntax is intentionally minimal — there is no expression
 * language here, and adding one would be a security regression:
 *
 *   * the ONLY construct is `{{path.to.value}}`;
 *   * no conditionals, no loops, no helpers, no function calls, no filters;
 *   * `path` must appear in the event's whitelist (from the code catalogue);
 *   * an unknown or unavailable value is an ERROR, not an empty string, so a
 *     half-rendered email ("Ciao , la sessione di  è confermata") never ships.
 *
 * Pure module: no database, no I/O, no `server-only` — directly unit-testable.
 */

/** Values a placeholder may resolve to. Objects are containers, never output. */
export type TemplateValue = string | number | null | undefined;
export type TemplateContext = {
  [key: string]: TemplateValue | TemplateContext;
};

export class TemplateVariableError extends Error {
  readonly variable: string;
  readonly reason: 'not_whitelisted' | 'missing_value' | 'not_scalar';

  constructor(
    variable: string,
    reason: 'not_whitelisted' | 'missing_value' | 'not_scalar',
    message: string
  ) {
    super(message);
    this.name = 'TemplateVariableError';
    this.variable = variable;
    this.reason = reason;
  }
}

/** `{{ path.to.value }}` — whitespace tolerated, nothing else accepted. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*)\s*\}\}/g;

/**
 * Divides a template body into paragraphs. The database stores prose, not
 * markup: the layout decides how a paragraph looks, so a restyling never has to
 * migrate stored content.
 */
export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replaces every placeholder in `template`.
 *
 * @param mode `html` escapes each value; `text` inserts it verbatim.
 * @throws TemplateVariableError on the first unusable placeholder — the caller
 *         records the failure and does not send.
 */
export function renderTemplate(
  template: string,
  context: TemplateContext,
  allowedVariables: readonly string[],
  mode: 'html' | 'text' = 'html'
): string {
  const allowed = new Set(allowedVariables);

  return template.replace(PLACEHOLDER, (_match, path: string) => {
    if (!allowed.has(path)) {
      throw new TemplateVariableError(
        path,
        'not_whitelisted',
        `Il segnaposto "{{${path}}}" non è consentito per questo evento.`
      );
    }

    const value = resolvePath(context, path);

    if (value === null || value === undefined || value === '') {
      throw new TemplateVariableError(
        path,
        'missing_value',
        `Valore mancante per il segnaposto "{{${path}}}".`
      );
    }

    if (typeof value === 'object') {
      throw new TemplateVariableError(
        path,
        'not_scalar',
        `Il segnaposto "{{${path}}}" punta a un oggetto, non a un valore.`
      );
    }

    const text = String(value);
    return mode === 'html' ? escapeHtml(text) : text;
  });
}

function resolvePath(
  context: TemplateContext,
  path: string
): TemplateValue | TemplateContext {
  let current: TemplateValue | TemplateContext = context;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    // Own properties only: a template must not reach prototype members.
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as TemplateContext)[segment];
  }
  return current;
}

/** Every placeholder a template string references, deduplicated. */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Static check of a template against a whitelist, without a context. Used by
 * the seed script and by tests so a broken template is caught before it is
 * stored, not at send time.
 */
export function validateTemplateVariables(
  template: string,
  allowedVariables: readonly string[]
): { valid: boolean; unknown: string[] } {
  const allowed = new Set(allowedVariables);
  const unknown = extractVariables(template).filter((v) => !allowed.has(v));
  return { valid: unknown.length === 0, unknown };
}

/**
 * Fallback plain-text body, derived from the HTML when `text_body` is null.
 * Every email ships with a text part — this is the guarantee of last resort.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
