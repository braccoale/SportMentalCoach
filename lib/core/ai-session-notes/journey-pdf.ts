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
import type {
  JourneyCommitment,
  MentalJourney,
  MentalJourneyEntry,
} from './mental-journey';

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

export type JourneyPdfInput = {
  athleteName: string;
  athlete: {
    age: number | null;
    sportLabel: string | null;
    levelLabel: string | null;
    avatarBytes?: Uint8Array | null;
  };
  sessionStats: {
    completedSessions: number;
    totalSessionMinutes: number;
    averageSessionMinutes: number | null;
  };
  coachName: string;
  periodLabel: string;
  generatedAt: Date;
  journey: MentalJourney;
  logoBytes?: Uint8Array | null;
};

type PdfContext = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

export async function buildMentalJourneyPdf(
  input: JourneyPdfInput
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
  ]);
  const logo = await embedLogo(document, input.logoBytes ?? null);
  const athleteAvatar = await embedImage(
    document,
    input.athlete.avatarBytes ?? null
  );
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const context: PdfContext = { document, page, regular, bold, y: PAGE_HEIGHT };

  document.setTitle(`Percorso mentale di ${input.athleteName}`);
  document.setAuthor('KaiPai Mental Coaching');
  document.setSubject(
    'Documento riservato con contenuti assistiti da IA e revisionati dal coach'
  );
  document.setCreator('KaiPai Session Compass');
  document.setProducer('KaiPai Session Compass');
  document.setCreationDate(input.generatedAt);
  document.setModificationDate(input.generatedAt);
  document.setKeywords([
    'KaiPai',
    'mental coaching',
    'percorso mentale',
    'documento riservato',
    'ai-assisted',
    'human-reviewed',
    'personal-data',
    'confidential',
  ]);
  setComplianceMetadata(document);

  drawCover(context, input, logo, athleteAvatar);
  drawSummaryCards(context, input);

  const approvedTimeline = input.journey.timeline.filter(
    (entry) => entry.isApproved
  );
  const latestApproved = approvedTimeline[0] ?? null;

  drawSectionTitle(context, 'Sintesi del percorso');
  drawKeyValue(context, 'Finestra considerata', input.periodLabel);
  drawKeyValue(
    context,
    'Periodo del percorso',
    formatJourneyRange(input.journey, input.generatedAt)
  );
  if (latestApproved) {
    drawParagraph(context, latestApproved.summary, { size: 10.5, lineHeight: 15 });
  } else {
    drawParagraph(context, 'Non sono presenti riepiloghi approvati nel periodo selezionato.');
  }

  drawSectionTitle(context, 'Temi ricorrenti');
  if (input.journey.recurringThemes.length > 0) {
    for (const theme of input.journey.recurringThemes) {
      drawBullet(
        context,
        `${theme.label} - emerso in ${theme.occurrences} sedute approvate`
      );
    }
  } else {
    drawMutedNote(context, 'Nessun tema ricorrente consolidato nel periodo selezionato.');
  }

  drawSectionTitle(context, 'Impegni concordati');
  drawCommitmentBreakdown(context, input.journey);
  if (input.journey.followThrough.length > 0) {
    context.y -= 6;
    for (const commitment of input.journey.followThrough) {
      drawCommitment(context, commitment);
    }
  } else {
    drawMutedNote(context, 'Non ci sono impegni aperti o recenti da riportare.');
  }

  drawSectionTitle(context, 'Punti da riprendere');
  if (input.journey.pointsToRevisit.length > 0) {
    for (const point of input.journey.pointsToRevisit) {
      drawBullet(context, point.text, point.sourceLabel);
    }
  } else {
    drawMutedNote(context, 'Nessun punto da riprendere è stato registrato.');
  }

  drawSectionTitle(context, 'Cronologia delle sedute approvate');
  if (approvedTimeline.length > 0) {
    for (const entry of approvedTimeline) drawSession(context, entry);
  } else {
    drawMutedNote(context, 'Nessuna seduta approvata nel periodo selezionato.');
  }

  drawFooters(document, regular, bold);

  return document.save();
}

export function journeyPdfFileName(athleteName: string, generatedAt: Date): string {
  const slug = athleteName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'atleta';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(generatedAt);
  return `percorso-${slug}-${date}.pdf`;
}

export function journeyPdfDownloadHeaders(fileName: string): Record<string, string> {
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

function setComplianceMetadata(document: PDFDocument) {
  const infoReference = document.context.trailerInfo.Info;
  if (!infoReference) return;

  const info = document.context.lookup(infoReference, PDFDict);
  const fields = {
    AIContentDisclosure:
      'AI-assisted content derived from session transcripts and human-reviewed by the coach',
    HumanReview: 'coach-approved',
    AutomatedDecisionMaking: 'none',
    Confidentiality: 'personal-data; authorised-coach-use',
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

const embedLogo = embedImage;

function drawCover(
  context: PdfContext,
  input: JourneyPdfInput,
  logo: PDFImage | null,
  athleteAvatar: PDFImage | null
) {
  const { page, bold, regular } = context;
  const coverHeight = 176;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - coverHeight,
    width: PAGE_WIDTH,
    height: coverHeight,
    color: INK,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - coverHeight,
    width: 4,
    height: coverHeight,
    color: RED,
  });

  if (logo) {
    const width = 112;
    const height = width * (logo.height / logo.width);
    page.drawImage(logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 42,
      width,
      height,
    });
  } else {
    page.drawText('KAI PAI', {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 34,
      size: 11,
      font: bold,
      color: WHITE,
    });
  }

  const generatedDate = safeText(formatLongDate(input.generatedAt), regular);
  page.drawText(generatedDate, {
    x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(generatedDate, 8.5),
    y: PAGE_HEIGHT - 31,
    size: 8.5,
    font: regular,
    color: rgb(0.78, 0.8, 0.83),
  });

  page.drawText('PERCORSO MENTALE', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 70,
    size: 8,
    font: bold,
    color: RED,
  });
  const avatarSize = 58;
  const avatarX = PAGE_WIDTH - MARGIN_X - avatarSize;
  if (athleteAvatar) {
    page.drawRectangle({
      x: avatarX - 2,
      y: PAGE_HEIGHT - 135,
      width: avatarSize + 4,
      height: avatarSize + 4,
      color: WHITE,
      borderColor: RED,
      borderWidth: 0.9,
    });
    page.drawImage(athleteAvatar, {
      x: avatarX,
      y: PAGE_HEIGHT - 133,
      width: avatarSize,
      height: avatarSize,
    });
  }

  const safeName = safeText(input.athleteName, bold);
  page.drawText(safeName, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 99,
    size: fitTextSize(safeName, athleteAvatar ? avatarX - MARGIN_X - 18 : CONTENT_WIDTH, regular, 23, 18),
    font: regular,
    color: WHITE,
  });
  const profileLine = athleteProfileLine(input.athlete);
  if (profileLine) {
    page.drawText(safeText(profileLine, regular), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 117,
      size: 8.8,
      font: regular,
      color: rgb(0.86, 0.87, 0.9),
    });
  }
  page.drawText(
    safeText(
      `Preparato per ${input.coachName}`,
      regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 133,
      size: 7.8,
      font: regular,
      color: rgb(0.78, 0.8, 0.83),
    }
  );
  page.drawText(
    safeText(
      'CONTENUTO ASSISTITO DA IA - REVISIONATO E APPROVATO DAL COACH',
      regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 149,
      size: 6.7,
      font: bold,
      color: rgb(0.9, 0.32, 0.36),
    }
  );
  page.drawText(
    safeText(
      'Documento riservato con dati personali - non e una diagnosi ne una decisione automatizzata.',
      regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 161,
      size: 6.4,
      font: regular,
      color: rgb(0.73, 0.75, 0.78),
    }
  );
  page.drawText(
    safeText(
      `Puo contenere errori - ${PRIVACY_CONTACT_EMAIL} - kaipaicoaching.com/privacy`,
      regular
    ),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 171,
      size: 6.4,
      font: regular,
      color: rgb(0.73, 0.75, 0.78),
    }
  );

  context.y = PAGE_HEIGHT - 190;
}

function drawSummaryCards(context: PdfContext, input: JourneyPdfInput) {
  ensureSpace(context, 58);
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const stats = input.sessionStats;
  const journey = input.journey;
  const cards = [
    {
      label: 'SESSIONI SVOLTE',
      value: String(stats.completedSessions),
      note: 'nel percorso',
    },
    {
      label: 'TEMPO IN SESSIONE',
      value: formatTotalDuration(stats.totalSessionMinutes),
      note: 'tempo totale',
    },
    {
      label: 'DURATA MEDIA',
      value:
        stats.averageSessionMinutes == null
          ? '-'
          : formatTotalDuration(stats.averageSessionMinutes),
      note: 'per sessione',
    },
    {
      label: 'ATTIVITÀ CONCORDATE',
      value: String(journey.summary.commitments.total),
      note:
        journey.summary.commitments.completed === 1
          ? '1 completata'
          : `${journey.summary.commitments.completed} completate`,
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
    context.page.drawRectangle({
      x,
      y: context.y - 2,
      width,
      height: 2,
      color: RED,
    });
    context.page.drawText(card.label, {
      x: x + 12,
      y: context.y - 15,
      size: 6.5,
      font: context.bold,
      color: MUTED,
    });
    context.page.drawText(card.value, {
      x: x + 12,
      y: context.y - 33,
      size: fitTextSize(card.value, width - 24, context.bold, 15, 11),
      font: context.bold,
      color: INK,
    });
    context.page.drawText(safeText(card.note, context.regular), {
      x: x + 12,
      y: context.y - 43,
      size: 6.2,
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

function drawKeyValue(context: PdfContext, label: string, value: string) {
  ensureSpace(context, 17);
  const safeLabel = safeText(`${label}:`, context.bold);
  context.page.drawText(safeLabel, {
    x: MARGIN_X,
    y: context.y,
    size: 9,
    font: context.bold,
    color: MUTED,
  });
  context.page.drawText(safeText(value, context.regular), {
    x: MARGIN_X + context.bold.widthOfTextAtSize(safeLabel, 9) + 5,
    y: context.y,
    size: 9,
    font: context.regular,
    color: TEXT,
  });
  context.y -= 16;
}

function drawParagraph(
  context: PdfContext,
  text: string,
  options: { size?: number; lineHeight?: number; color?: ReturnType<typeof rgb> } = {}
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
      color: options.color ?? TEXT,
    });
    context.y -= lineHeight;
  }
  context.y -= 7;
}

function drawBullet(context: PdfContext, text: string, note?: string) {
  const size = 9.5;
  const lines = wrapText(text, CONTENT_WIDTH - 18, context.regular, size);
  const noteLines = note
    ? wrapText(note, CONTENT_WIDTH - 18, context.regular, 7.8)
    : [];
  const height = lines.length * 13.5 + noteLines.length * 11 + 5;
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
      y: context.y - index * 13.5,
      size,
      font: context.regular,
      color: TEXT,
    });
  });
  let noteY = context.y - lines.length * 13.5;
  noteLines.forEach((line) => {
    context.page.drawText(line, {
      x: MARGIN_X + 17,
      y: noteY,
      size: 7.8,
      font: context.regular,
      color: MUTED,
    });
    noteY -= 11;
  });
  context.y -= height;
}

function drawMutedNote(context: PdfContext, text: string) {
  ensureSpace(context, 38);
  const lines = wrapText(text, CONTENT_WIDTH - 24, context.regular, 9);
  const height = lines.length * 12 + 18;
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

function drawCommitmentBreakdown(context: PdfContext, journey: MentalJourney) {
  const counts = journey.summary.commitments;
  const text = [
    `${counts.completed} completati`,
    `${counts.inProgress} in corso`,
    `${counts.pending} da iniziare`,
    `${counts.skipped} non completati`,
  ].join('  |  ');
  drawMutedNote(context, text);
}

function drawCommitment(context: PdfContext, commitment: JourneyCommitment) {
  const status = commitmentStatusLabel(commitment.status);
  const due = commitment.dueDate
    ? ` - scadenza ${formatShortDate(commitment.dueDate)}`
    : '';
  const overdue = commitment.isOverdue ? ' - in ritardo' : '';
  drawBullet(context, commitment.title, `${status}${due}${overdue}`);
}

function drawSession(context: PdfContext, entry: MentalJourneyEntry) {
  ensureSpace(context, 43);
  context.page.drawText(formatLongDate(new Date(entry.sessionDate ?? entry.approvedAt)), {
    x: MARGIN_X,
    y: context.y,
    size: 11,
    font: context.bold,
    color: INK,
  });
  context.y -= 17;
  if (entry.focus) drawKeyValue(context, 'Tema principale', entry.focus);
  drawParagraph(context, entry.summary, { size: 9.5, lineHeight: 13.5 });
  context.page.drawLine({
    start: { x: MARGIN_X, y: context.y + 2 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: context.y + 2 },
    thickness: 0.5,
    color: LINE,
  });
  context.y -= 14;
}

function drawFooters(
  document: PDFDocument,
  regular: PDFFont,
  bold: PDFFont
) {
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
  context.page = context.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  context.y = PAGE_HEIGHT - 56;
  context.page.drawText('KAI PAI / PERCORSO MENTALE', {
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

function formatJourneyRange(journey: MentalJourney, fallback: Date): string {
  const first = journey.summary.firstSessionDate;
  const last = journey.summary.lastSessionDate;
  if (!first && !last) return `aggiornato al ${formatLongDate(fallback)}`;
  if (!first || !last || first === last) return formatLongDate(new Date(first ?? last!));
  return `${formatLongDate(new Date(first))} - ${formatLongDate(new Date(last))}`;
}

function athleteProfileLine(input: JourneyPdfInput['athlete']): string {
  return [
    input.age == null ? null : `${input.age} anni`,
    input.sportLabel,
    input.levelLabel,
  ]
    .filter((value): value is string => Boolean(value))
    .join('  |  ');
}

function formatTotalDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(value);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${value}T12:00:00Z`));
}

function commitmentStatusLabel(status: JourneyCommitment['status']): string {
  if (status === 'completed') return 'Completato';
  if (status === 'in_progress') return 'In corso';
  if (status === 'skipped') return 'Non completato';
  return 'Da iniziare';
}
