import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AcademyRecapContent } from './contract';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BOTTOM_LIMIT = 64;

const INK = rgb(0.055, 0.059, 0.071);
const TEXT = rgb(0.145, 0.161, 0.19);
const MUTED = rgb(0.42, 0.45, 0.5);
const RED = rgb(0.86, 0.035, 0.08);

export type AcademyRecapPdfInput = {
  courseTitle: string;
  moduleTitle: string;
  sessionDate: Date;
  instructorName: string;
  generatedAt: Date;
  recap: AcademyRecapContent;
};

type Ctx = { document: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont; y: number };

function wrapText(text: string, width: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function ensureSpace(ctx: Ctx, height: number) {
  if (ctx.y - height >= BOTTOM_LIMIT) return;
  ctx.page = ctx.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN_X;
}

function drawParagraph(ctx: Ctx, text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) {
  const size = opts.size ?? 10.5;
  const font = opts.font ?? ctx.regular;
  const color = opts.color ?? TEXT;
  const lines = wrapText(text, CONTENT_WIDTH, font, size);
  for (const line of lines) {
    ensureSpace(ctx, size + 4);
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size, font, color });
    ctx.y -= size + 4;
  }
}

function drawSectionTitle(ctx: Ctx, title: string) {
  ensureSpace(ctx, 28);
  ctx.y -= 6;
  ctx.page.drawText(title.toUpperCase(), { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.bold, color: RED });
  ctx.y -= 16;
}

function drawBulletList(ctx: Ctx, items: readonly string[], emptyLabel: string) {
  if (items.length === 0) {
    drawParagraph(ctx, emptyLabel, { color: MUTED, size: 9.5 });
    return;
  }
  for (const item of items) {
    ensureSpace(ctx, 16);
    const lines = wrapText(item, CONTENT_WIDTH - 14, ctx.regular, 10.5);
    ctx.page.drawText('–', { x: MARGIN_X, y: ctx.y, size: 10.5, font: ctx.regular, color: TEXT });
    for (const [index, line] of lines.entries()) {
      if (index > 0) ensureSpace(ctx, 15);
      ctx.page.drawText(line, { x: MARGIN_X + 14, y: ctx.y, size: 10.5, font: ctx.regular, color: TEXT });
      ctx.y -= 15;
    }
  }
  ctx.y -= 4;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(value);
}

/**
 * Un PDF del recap di sessione — layout proprio, molto più semplice di
 * `buildSessionPdf` (session-pdf.ts): quel generatore è costruito attorno a
 * `SessionCompassView`, un report terapeutico con sei metriche e profilo
 * atleta, un contratto diverso da quello del recap Academy. Riusa la stessa
 * libreria (pdf-lib) e lo stesso registro visivo (Helvetica, rosso KaiPai
 * per i titoli di sezione), non forza un contenuto diverso dentro un'altra
 * forma.
 */
export async function buildAcademyRecapPdf(input: AcademyRecapPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx: Ctx = { document, page, regular, bold, y: PAGE_HEIGHT - MARGIN_X };

  ctx.page.drawText('KaiPai Academy — Recap sessione', { x: MARGIN_X, y: ctx.y, size: 9, font: bold, color: MUTED });
  ctx.y -= 26;
  ctx.page.drawText(input.moduleTitle, { x: MARGIN_X, y: ctx.y, size: 18, font: bold, color: INK });
  ctx.y -= 22;
  drawParagraph(ctx, input.courseTitle, { color: MUTED, size: 11 });
  drawParagraph(ctx, `${formatDate(input.sessionDate)} · Docente: ${input.instructorName}`, { color: MUTED, size: 9.5 });
  ctx.y -= 8;

  drawSectionTitle(ctx, 'Concetti chiave');
  drawBulletList(ctx, input.recap.keyConcepts, 'Nessun concetto chiave registrato.');

  drawSectionTitle(ctx, 'Strumenti e protocolli citati');
  drawBulletList(ctx, input.recap.toolsAndProtocols, 'Nessuno strumento specifico citato.');

  drawSectionTitle(ctx, 'Casi pratici discussi');
  drawBulletList(ctx, input.recap.practicalCases, 'Nessun caso pratico registrato.');

  drawSectionTitle(ctx, 'Domande e dubbi rimasti aperti');
  drawBulletList(ctx, input.recap.openQuestions, 'Nessuna domanda aperta registrata.');

  drawSectionTitle(ctx, 'Prossima azione pratica');
  drawParagraph(ctx, input.recap.nextAction || 'Nessuna azione indicata.');

  drawSectionTitle(ctx, 'Argomenti e moduli trattati');
  drawBulletList(ctx, input.recap.topicsCovered, 'Nessun argomento registrato.');

  ensureSpace(ctx, 30);
  ctx.y -= 10;
  ctx.page.drawText(
    `Generato il ${formatDate(input.generatedAt)} · KaiPai Academy`,
    { x: MARGIN_X, y: BOTTOM_LIMIT - 24, size: 8, font: regular, color: MUTED }
  );

  return document.save();
}

export function academyRecapPdfFileName(moduleTitle: string, sessionDate: Date): string {
  const slug =
    moduleTitle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'sessione';
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(sessionDate);
  return `recap-academy-${slug}-${isoDate}.pdf`;
}
