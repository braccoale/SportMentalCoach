import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import type { ConversationMap } from './conversation-map';
import type { SessionCompassView } from './session-compass';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BOTTOM_LIMIT = 72;

const INK = rgb(0.055, 0.059, 0.071);
const TEXT = rgb(0.145, 0.161, 0.19);
const MUTED = rgb(0.39, 0.42, 0.47);
const FAINT = rgb(0.95, 0.955, 0.965);
const LINE = rgb(0.86, 0.87, 0.89);
const RED = rgb(0.86, 0.035, 0.08);
const WHITE = rgb(1, 1, 1);
const PRIVACY_CONTACT_EMAIL = 'privacy@kaipaicoaching.com';
const PRIVACY_NOTICE_URL = 'https://www.kaipaicoaching.com/privacy';

export type SessionPdfInput = {
  athleteName: string;
  coachName: string;
  sessionDate: Date | null;
  sessionDurationMinutes: number | null;
  serviceTitle: string | null;
  generatedAt: Date;
  athlete: {
    age: number | null;
    sportLabel: string | null;
    levelLabel: string | null;
    avatarBytes?: Uint8Array | null;
  };
  report: SessionCompassView;
  conversationMap: ConversationMap | null;
  logoBytes?: Uint8Array | null;
};

type PdfContext = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

export async function buildSessionPdf(input: SessionPdfInput): Promise<Uint8Array> {
  if (!input.report.isApproved || !input.report.document) {
    throw new Error('SESSION_REPORT_NOT_APPROVED');
  }

  const document = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
  ]);
  const [logo, athleteAvatar] = await Promise.all([
    embedImage(document, input.logoBytes ?? null),
    embedImage(document, input.athlete.avatarBytes ?? null),
  ]);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const context: PdfContext = { document, page, regular, bold, y: PAGE_HEIGHT };
  const report = input.report.document;

  document.setTitle(`Report sessione di ${input.athleteName}`);
  document.setAuthor('KaiPai Mental Coaching');
  document.setSubject(
    'Report di sessione riservato, assistito da IA e approvato dal coach'
  );
  document.setCreator('KaiPai Session Compass');
  document.setProducer('KaiPai Session Compass');
  document.setCreationDate(input.generatedAt);
  document.setModificationDate(input.generatedAt);
  document.setKeywords([
    'KaiPai',
    'mental coaching',
    'report sessione',
    'documento riservato',
    'ai-assisted',
    'human-reviewed',
    'personal-data',
    'confidential',
  ]);
  setComplianceMetadata(document, input.report.reportVersion);

  drawCover(context, input, logo, athleteAvatar);
  drawStats(context, input);

  drawSectionTitle(context, 'Sintesi della sessione');
  drawParagraph(context, compactText(report.sessionOverview.summary, 1_100), {
    size: 10.5,
    lineHeight: 15,
  });

  drawSectionTitle(context, 'Temi emersi');
  if (report.sessionOverview.themes.length > 0) {
    for (const theme of report.sessionOverview.themes.slice(0, 3)) {
      drawBullet(context, compactText(theme.text, 320), minuteLabel(theme.evidence.minute));
    }
  } else {
    drawMutedNote(context, 'Nessun tema consolidato nel riepilogo approvato.');
  }
  if (report.sessionOverview.emergingResource) {
    drawLabeledParagraph(
      context,
      'Risorsa emersa',
      compactText(report.sessionOverview.emergingResource.text, 420)
    );
  }

  drawSectionTitle(context, 'Momenti chiave');
  if (report.keyMoments.length > 0) {
    for (const moment of report.keyMoments.slice(0, 3)) {
      drawMoment(
        context,
        compactText(moment.title, 130),
        compactText(moment.explanation, 430),
        `${minuteLabel(moment.evidence.minute)} · ${speakerLabel(moment.speaker)}`
      );
    }
  } else {
    drawMutedNote(context, 'Nessun momento chiave è stato incluso nel report approvato.');
  }

  if (context.y < 390) startContinuationPage(context);

  drawSectionTitle(context, 'Racconto della sessione');
  if (report.story?.paragraphs.length) {
    if (report.story.title.trim()) {
      drawSubheading(context, compactText(report.story.title, 210));
    }
    for (const paragraph of report.story.paragraphs.slice(0, 5)) {
      drawParagraph(context, compactText(paragraph.text, 620), {
        size: 9.4,
        lineHeight: 13.4,
      });
    }
    if (report.story.throughLine) {
      drawLabeledParagraph(
        context,
        'Collegamento con il percorso',
        compactText(report.story.throughLine, 460)
      );
    }
  } else {
    drawMutedNote(context, 'Il racconto esteso non è disponibile per questa sessione.');
  }

  drawSectionTitle(context, 'Attività concordate');
  const commitments = input.report.trackedCommitments;
  if (commitments.length > 0) {
    for (const commitment of commitments.slice(0, 6)) {
      const details = [
        trackedCommitmentStatusLabel(commitment.status),
        speakerLabel(commitment.owner),
        commitment.dueDate ? `scadenza ${formatShortDate(commitment.dueDate)}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' · ');
      drawBullet(context, compactText(commitment.title, 360), details);
    }
  } else if (report.commitments.length > 0) {
    for (const commitment of report.commitments.slice(0, 6)) {
      const details = [
        commitmentStatusLabel(commitment.status),
        speakerLabel(commitment.owner),
        commitment.dueDate ? `scadenza ${formatShortDate(commitment.dueDate)}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' · ');
      drawBullet(context, compactText(commitment.text, 360), details);
    }
  } else {
    drawMutedNote(context, 'Non sono state concordate attività operative.');
  }

  const revisit = [
    ...report.nextSessionPrep.slice(0, 3).map((item) => item.text),
    ...(report.missedOpportunities ?? []).slice(0, 2).map((item) => item.followUp),
  ];
  drawSectionTitle(context, 'Punti per la prossima sessione');
  if (revisit.length > 0) {
    for (const item of revisit.slice(0, 5)) {
      drawBullet(context, compactText(item, 360));
    }
  } else {
    drawMutedNote(context, 'Nessun punto specifico da riprendere è stato registrato.');
  }

  drawFooters(document, regular, bold);
  return document.save();
}

export function sessionPdfFileName(athleteName: string, sessionDate: Date): string {
  const slug = athleteName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'atleta';
  return `sessione-${slug}-${formatIsoDate(sessionDate)}.pdf`;
}

export function sessionPdfDownloadHeaders(fileName: string): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
    'Referrer-Policy': 'no-referrer',
  };
}

function setComplianceMetadata(document: PDFDocument, reportVersion: number) {
  const infoReference = document.context.trailerInfo.Info;
  if (!infoReference) return;
  const info = document.context.lookup(infoReference, PDFDict);
  const fields = {
    AIContentDisclosure:
      'AI-assisted content derived from session data and human-reviewed by the coach',
    HumanReview: 'coach-approved',
    AutomatedDecisionMaking: 'none',
    Confidentiality: 'personal-data; authorised-coach-use',
    ReportScope: 'single-session',
    ReportVersion: String(reportVersion),
    PrivacyContact: PRIVACY_CONTACT_EMAIL,
    PrivacyNotice: PRIVACY_NOTICE_URL,
  };
  for (const [name, value] of Object.entries(fields)) {
    info.set(PDFName.of(name), PDFHexString.fromText(value));
  }
}

async function embedImage(
  document: PDFDocument,
  bytes: Uint8Array | null
): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    return await document.embedPng(bytes);
  } catch {
    try {
      return await document.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawCover(
  context: PdfContext,
  input: SessionPdfInput,
  logo: PDFImage | null,
  athleteAvatar: PDFImage | null
) {
  const coverHeight = 180;
  context.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - coverHeight,
    width: PAGE_WIDTH,
    height: coverHeight,
    color: INK,
  });
  context.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - coverHeight,
    width: 4,
    height: coverHeight,
    color: RED,
  });

  if (logo) {
    const width = 112;
    context.page.drawImage(logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 42,
      width,
      height: width * (logo.height / logo.width),
    });
  } else {
    context.page.drawText('KAI PAI', {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 34,
      size: 11,
      font: context.bold,
      color: WHITE,
    });
  }

  const generatedDate = safeText(formatLongDate(input.generatedAt), context.regular);
  context.page.drawText(generatedDate, {
    x: PAGE_WIDTH - MARGIN_X - context.regular.widthOfTextAtSize(generatedDate, 8.5),
    y: PAGE_HEIGHT - 31,
    size: 8.5,
    font: context.regular,
    color: rgb(0.78, 0.8, 0.83),
  });
  context.page.drawText('REPORT DELLA SESSIONE', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 69,
    size: 8,
    font: context.bold,
    color: RED,
  });

  const avatarSize = 58;
  const avatarX = PAGE_WIDTH - MARGIN_X - avatarSize;
  if (athleteAvatar) {
    context.page.drawRectangle({
      x: avatarX - 2,
      y: PAGE_HEIGHT - 137,
      width: avatarSize + 4,
      height: avatarSize + 4,
      color: WHITE,
      borderColor: RED,
      borderWidth: 0.9,
    });
    context.page.drawImage(athleteAvatar, {
      x: avatarX,
      y: PAGE_HEIGHT - 135,
      width: avatarSize,
      height: avatarSize,
    });
  }

  const athleteName = safeText(input.athleteName, context.regular);
  context.page.drawText(athleteName, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 97,
    size: fitTextSize(
      athleteName,
      athleteAvatar ? avatarX - MARGIN_X - 18 : CONTENT_WIDTH,
      context.regular,
      23,
      18
    ),
    font: context.regular,
    color: WHITE,
  });

  const details = [
    input.sessionDate ? formatLongDate(input.sessionDate) : null,
    input.serviceTitle,
    athleteProfileLine(input.athlete),
  ]
    .filter((value): value is string => Boolean(value))
    .join('  |  ');
  if (details) {
    context.page.drawText(safeText(details, context.regular), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 116,
      size: fitTextSize(details, athleteAvatar ? avatarX - MARGIN_X - 16 : CONTENT_WIDTH, context.regular, 8.5, 6.8),
      font: context.regular,
      color: rgb(0.86, 0.87, 0.9),
    });
  }
  context.page.drawText(safeText(`Preparato per ${input.coachName}`, context.regular), {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 133,
    size: 7.8,
    font: context.regular,
    color: rgb(0.78, 0.8, 0.83),
  });
  context.page.drawText(
    'CONTENUTO ASSISTITO DA IA - REVISIONATO E APPROVATO DAL COACH',
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 151,
      size: 6.7,
      font: context.bold,
      color: rgb(0.9, 0.32, 0.36),
    }
  );
  context.page.drawText(
    safeText(
      'Documento riservato. Non contiene trascrizione o note private e non è una diagnosi.',
      context.regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 163,
      size: 6.4,
      font: context.regular,
      color: rgb(0.73, 0.75, 0.78),
    }
  );
  context.page.drawText(
    safeText(
      `Può contenere errori - ${PRIVACY_CONTACT_EMAIL} - kaipaicoaching.com/privacy`,
      context.regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 174,
      size: 6.4,
      font: context.regular,
      color: rgb(0.73, 0.75, 0.78),
    }
  );
  context.y = PAGE_HEIGHT - 194;
}

function drawStats(context: PdfContext, input: SessionPdfInput) {
  ensureSpace(context, 58);
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const map = input.conversationMap;
  const coachLane = map?.lanes.find((lane) => lane.role === 'coach');
  const athleteLane = map?.lanes.find((lane) => lane.role === 'athlete');
  const durationMinutes = input.sessionDurationMinutes ??
    (map ? Math.round(map.durationMs / 60_000) : null);
  const cards = [
    {
      label: 'DURATA',
      value: durationMinutes == null ? '-' : formatDuration(durationMinutes),
      note: 'tempo sessione',
    },
    {
      label: 'PARLATO C / A',
      value:
        coachLane && athleteLane
          ? `${coachLane.sharePercent}% / ${athleteLane.sharePercent}%`
          : '-',
      note: map?.rolesWithoutRecording.length ? 'copertura parziale' : 'coach / atleta',
    },
    {
      label: 'DOMANDE',
      value: map ? `${map.insight.coachQuestionTurns}/${map.insight.coachTurns}` : '-',
      note: 'interventi coach',
    },
    {
      label: 'TURNI MEDI',
      value: map
        ? `${map.insight.coachAverageTurnSec}s / ${map.insight.athleteAverageTurnSec}s`
        : '-',
      note: 'coach / atleta',
    },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN_X + index * (width + gap);
    context.page.drawRectangle({
      x,
      y: context.y - 48,
      width,
      height: 48,
      color: FAINT,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    context.page.drawRectangle({ x, y: context.y - 2, width, height: 2, color: RED });
    context.page.drawText(card.label, {
      x: x + 10,
      y: context.y - 15,
      size: 6.3,
      font: context.bold,
      color: MUTED,
    });
    context.page.drawText(card.value, {
      x: x + 10,
      y: context.y - 33,
      size: fitTextSize(card.value, width - 20, context.bold, 14, 9.5),
      font: context.bold,
      color: INK,
    });
    context.page.drawText(safeText(card.note, context.regular), {
      x: x + 10,
      y: context.y - 43,
      size: 6.1,
      font: context.regular,
      color: MUTED,
    });
  });
  context.y -= 62;
}

function drawSectionTitle(context: PdfContext, title: string) {
  ensureSpace(context, 38);
  context.page.drawRectangle({
    x: MARGIN_X,
    y: context.y - 16,
    width: 3,
    height: 17,
    color: RED,
  });
  context.page.drawText(safeText(title, context.bold), {
    x: MARGIN_X + 11,
    y: context.y - 14,
    size: 15,
    font: context.bold,
    color: INK,
  });
  context.y -= 32;
}

function drawSubheading(context: PdfContext, text: string) {
  const lines = wrapText(text, CONTENT_WIDTH, context.bold, 11.5);
  ensureSpace(context, lines.length * 15 + 4);
  lines.forEach((line, index) => {
    context.page.drawText(line, {
      x: MARGIN_X,
      y: context.y - index * 15,
      size: 11.5,
      font: context.bold,
      color: INK,
    });
  });
  context.y -= lines.length * 15 + 6;
}

function drawParagraph(
  context: PdfContext,
  text: string,
  options: { size?: number; lineHeight?: number } = {}
) {
  const size = options.size ?? 9.5;
  const lineHeight = options.lineHeight ?? 14;
  const lines = wrapText(text, CONTENT_WIDTH, context.regular, size);
  for (const line of lines) {
    ensureSpace(context, lineHeight + 2);
    context.page.drawText(line, {
      x: MARGIN_X,
      y: context.y,
      size,
      font: context.regular,
      color: TEXT,
    });
    context.y -= lineHeight;
  }
  context.y -= 7;
}

function drawLabeledParagraph(context: PdfContext, label: string, text: string) {
  ensureSpace(context, 28);
  context.page.drawText(safeText(label.toUpperCase(), context.bold), {
    x: MARGIN_X,
    y: context.y,
    size: 7,
    font: context.bold,
    color: RED,
  });
  context.y -= 15;
  drawParagraph(context, text, { size: 9.2, lineHeight: 13 });
}

function drawBullet(context: PdfContext, text: string, note?: string) {
  const size = 9.4;
  const lines = wrapText(text, CONTENT_WIDTH - 18, context.regular, size);
  const noteLines = note ? wrapText(note, CONTENT_WIDTH - 18, context.regular, 7.7) : [];
  const height = lines.length * 13.3 + noteLines.length * 10.5 + 5;
  ensureSpace(context, height);
  context.page.drawText('-', {
    x: MARGIN_X + 1,
    y: context.y,
    size: 11,
    font: context.bold,
    color: RED,
  });
  lines.forEach((line, index) => {
    context.page.drawText(line, {
      x: MARGIN_X + 17,
      y: context.y - index * 13.3,
      size,
      font: context.regular,
      color: TEXT,
    });
  });
  let noteY = context.y - lines.length * 13.3;
  for (const line of noteLines) {
    context.page.drawText(line, {
      x: MARGIN_X + 17,
      y: noteY,
      size: 7.7,
      font: context.regular,
      color: MUTED,
    });
    noteY -= 10.5;
  }
  context.y -= height;
}

function drawMoment(context: PdfContext, title: string, explanation: string, note: string) {
  const titleLines = wrapText(title, CONTENT_WIDTH - 24, context.bold, 10);
  const bodyLines = wrapText(explanation, CONTENT_WIDTH - 24, context.regular, 8.9);
  const height = 22 + titleLines.length * 13 + bodyLines.length * 12.4 + 12;
  ensureSpace(context, height);
  context.page.drawRectangle({
    x: MARGIN_X,
    y: context.y - height + 5,
    width: CONTENT_WIDTH,
    height,
    color: FAINT,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  context.page.drawText(safeText(note.toUpperCase(), context.bold), {
    x: MARGIN_X + 12,
    y: context.y - 10,
    size: 6.5,
    font: context.bold,
    color: RED,
  });
  let y = context.y - 25;
  for (const line of titleLines) {
    context.page.drawText(line, {
      x: MARGIN_X + 12,
      y,
      size: 10,
      font: context.bold,
      color: INK,
    });
    y -= 13;
  }
  y -= 2;
  for (const line of bodyLines) {
    context.page.drawText(line, {
      x: MARGIN_X + 12,
      y,
      size: 8.9,
      font: context.regular,
      color: TEXT,
    });
    y -= 12.4;
  }
  context.y -= height + 7;
}

function drawMutedNote(context: PdfContext, text: string) {
  const lines = wrapText(text, CONTENT_WIDTH - 24, context.regular, 9);
  const height = lines.length * 12 + 18;
  ensureSpace(context, height + 7);
  context.page.drawRectangle({
    x: MARGIN_X,
    y: context.y - height + 5,
    width: CONTENT_WIDTH,
    height,
    color: FAINT,
  });
  lines.forEach((line, index) => {
    context.page.drawText(line, {
      x: MARGIN_X + 12,
      y: context.y - 9 - index * 12,
      size: 9,
      font: context.regular,
      color: MUTED,
    });
  });
  context.y -= height + 7;
}

function drawFooters(document: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const pages = document.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN_X, y: 63 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 63 },
      thickness: 0.45,
      color: LINE,
    });
    page.drawText('Con cura,', {
      x: MARGIN_X,
      y: 49,
      size: 6.8,
      font: regular,
      color: MUTED,
    });
    page.drawText('Il team KaiPai', {
      x: MARGIN_X,
      y: 36,
      size: 8.4,
      font: bold,
      color: INK,
    });
    page.drawText('Mental coaching per atleti e squadre', {
      x: MARGIN_X,
      y: 24,
      size: 6.6,
      font: regular,
      color: RED,
    });
    page.drawText('info@kaipaicoaching.com  |  www.kaipaicoaching.com', {
      x: MARGIN_X,
      y: 12,
      size: 6.3,
      font: regular,
      color: MUTED,
    });
    const pageLabel = `Pagina ${index + 1} di ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(pageLabel, 7.2),
      y: 12,
      size: 7.2,
      font: regular,
      color: MUTED,
    });
    const reserved = 'Documento riservato al coach';
    page.drawText(reserved, {
      x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(reserved, 6.4),
      y: 49,
      size: 6.4,
      font: regular,
      color: MUTED,
    });
  });
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.y - height >= BOTTOM_LIMIT) return;
  startContinuationPage(context);
}

function startContinuationPage(context: PdfContext) {
  context.page = context.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  context.y = PAGE_HEIGHT - 56;
  context.page.drawText('KAI PAI / REPORT DELLA SESSIONE', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 34,
    size: 7.5,
    font: context.bold,
    color: RED,
  });
  context.page.drawLine({
    start: { x: MARGIN_X, y: PAGE_HEIGHT - 43 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: PAGE_HEIGHT - 43 },
    thickness: 0.5,
    color: LINE,
  });
}

function wrapText(text: string, width: number, font: PDFFont, size: number): string[] {
  const safe = safeText(text.replace(/\s+/g, ' ').trim(), font);
  if (!safe) return [];
  const words = safe.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function safeText(text: string, font: PDFFont): string {
  const normalized = text
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
  return [...normalized]
    .map((character) => {
      try {
        font.encodeText(character);
        return character;
      } catch {
        return '?';
      }
    })
    .join('');
}

function fitTextSize(
  text: string,
  maxWidth: number,
  font: PDFFont,
  preferredSize: number,
  minimumSize: number
): number {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function compactText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, Math.max(0, maxLength - 3));
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > maxLength * 0.7 ? lastSpace : shortened.length)}...`;
}

function athleteProfileLine(athlete: SessionPdfInput['athlete']): string {
  return [
    athlete.age == null ? null : `${athlete.age} anni`,
    athlete.sportLabel,
    athlete.levelLabel,
  ]
    .filter((value): value is string => Boolean(value))
    .join('  |  ');
}

function speakerLabel(value: 'coach' | 'athlete'): string {
  return value === 'coach' ? 'Coach' : 'Atleta';
}

function minuteLabel(minute: number): string {
  return `minuto ${Math.max(0, minute)}`;
}

function trackedCommitmentStatusLabel(status: string): string {
  if (status === 'completed') return 'Completata';
  if (status === 'in_progress') return 'In corso';
  if (status === 'skipped') return 'Non completata';
  return 'Da iniziare';
}

function commitmentStatusLabel(status: string): string {
  if (status === 'done') return 'Completata';
  if (status === 'in_progress') return 'In corso';
  if (status === 'dropped') return 'Non completata';
  return 'Da iniziare';
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function formatIsoDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
