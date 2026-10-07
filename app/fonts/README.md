# Font ospitati nel progetto

Manrope, Space Grotesk, Inter e JetBrains Mono (variabili, solo sottoinsieme latino), licenza SIL Open Font License 1.1, dai pacchetti `@fontsource-variable/*` 5.3.0.

Perché qui e non da Google Fonts: `next/font/google` scarica i font **durante la build**, e quando Google non rispondeva (più volte il 2026-10-07) la build di produzione falliva e il rilascio restava fermo. Con i file nel repository la build non dipende più da un servizio esterno.

Per aggiornarli: `npm pack @fontsource-variable/<nome>` e sostituire il file `*-latin-wght-normal.woff2`.
