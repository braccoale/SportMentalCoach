import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PdfDownloadButton,
  pdfFileNameFromDisposition,
} from './journey-pdf-button';

test('legge il nome PDF dall header di download', () => {
  assert.equal(
    pdfFileNameFromDisposition(
      'attachment; filename="percorso-giulia-martini-2026-08-22.pdf"'
    ),
    'percorso-giulia-martini-2026-08-22.pdf'
  );
});

test('preferisce il filename UTF-8 e ha un fallback sicuro', () => {
  assert.equal(
    pdfFileNameFromDisposition(
      "attachment; filename=percorso.pdf; filename*=UTF-8''percorso-Giulia%20Martini.pdf"
    ),
    'percorso-Giulia Martini.pdf'
  );
  assert.equal(pdfFileNameFromDisposition(null), 'percorso-mentale.pdf');
  assert.equal(
    pdfFileNameFromDisposition(null, 'report-sessione-kaipai.pdf'),
    'report-sessione-kaipai.pdf'
  );
});

test('mostra l asset PDF fornito come comando compatto e accessibile', () => {
  const html = renderToStaticMarkup(
    createElement(PdfDownloadButton, {
      href: '/api/coach/ai-session-notes/44/compass/export',
      accessibleLabel: 'Scarica e apri il report PDF della sessione',
    })
  );
  assert.match(html, /%2Ficons%2Fpdf-download\.png/);
  assert.doesNotMatch(html, />PDF sessione</);
  assert.match(html, /Scarica e apri il report PDF della sessione/);
});
