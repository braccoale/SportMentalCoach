import 'server-only';
import { getVerticalConfig, t } from '@/lib/core/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Low-level transport. Best-effort: never throws. Logs clearly whether the
 * email was skipped (not configured), sent, or failed. Uses the Resend REST
 * API via fetch, so nothing about Resend is required at startup.
 */
async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.log(`[email] skipped (not configured): "${input.subject}"`);
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(
        `[email] failed to ${input.to} (${res.status}): ${detail.slice(0, 200)}`
      );
      return;
    }
    console.log(`[email] sent to ${input.to}: "${input.subject}"`);
  } catch (error) {
    console.error(`[email] failed to ${input.to}:`, error);
  }
}

/**
 * Sends an email mirroring an in-app notification. The in-app notification
 * remains the source of truth; this is a best-effort enhancement.
 */
export async function sendNotificationEmail(input: {
  to: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const brand = t('brand.name', getVerticalConfig());
  const baseUrl = process.env.BASE_URL ?? '';
  const url = input.link ? `${baseUrl}${input.link}` : null;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#111">${escapeHtml(input.title)}</h2>
    ${input.body ? `<p style="color:#444">${escapeHtml(input.body)}</p>` : ''}
    ${
      url
        ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 18px;border-radius:9999px;text-decoration:none">Apri ${escapeHtml(brand)}</a></p>`
        : ''
    }
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="color:#999;font-size:12px">${escapeHtml(brand)}</p>
  </div>`;

  const text = `${input.title}\n${input.body ?? ''}${url ? `\n\n${url}` : ''}`;

  await sendEmail({ to: input.to, subject: input.title, html, text });
}
