-- 12 valori di business aggiuntivi (secondo giro), verificati uno per uno
-- leggendo il codice reale prima di scrivere questa migrazione — vedi
-- docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md,
-- sezione "Secondo giro". Additiva: solo INSERT, nessuna modifica di schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('VIDEO_RING_THROTTLE_SECONDS', '60'::jsonb, 'number', 'videochiamata', 'Blocco ripetizione chiamata (secondi)', 'Ogni quanto la stessa persona può essere richiamata per la stessa sessione.'),
  ('GUARDIAN_INVITATION_TTL_HOURS', '72'::jsonb, 'number', 'minori', 'Validità invito tutore (ore)', 'Per quanto tempo resta valido un invito a un tutore prima di scadere.'),
  ('NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES', '35'::jsonb, 'number', 'notifiche', 'Tolleranza finestra promemoria (minuti)', 'Deve restare sopra i 30 minuti (metà dell''intervallo di un''ora del cron dei promemoria, vedi .github/workflows/notification-reminders.yml): sotto quella soglia una prenotazione può cadere nel buco fra due esecuzioni e non ricevere il promemoria.'),
  ('NOTIFICATION_REMINDER_24H_LEAD_MINUTES', '1440'::jsonb, 'number', 'notifiche', 'Anticipo promemoria 24 ore (minuti)', 'Quanto prima della sessione parte il promemoria "24 ore".'),
  ('NOTIFICATION_REMINDER_1H_LEAD_MINUTES', '60'::jsonb, 'number', 'notifiche', 'Anticipo promemoria 1 ora (minuti)', 'Quanto prima della sessione parte il promemoria "1 ora".'),
  ('MOBILE_SESSION_HISTORY_DAYS', '120'::jsonb, 'number', 'mobile', 'Cronologia sessioni app (giorni)', 'Quanto indietro nel tempo l''app mostra le sessioni passate.'),
  ('AI_NOTES_LIVE_GAP_SECONDS', '90'::jsonb, 'number', 'ai_notes', 'Avviso voce non registrata (secondi)', 'Da quanto una voce può mancare dalla registrazione, a seduta in corso, prima che scatti l''avviso dal vivo.'),
  ('AI_NOTES_PARTIAL_COVERAGE_THRESHOLD', '0.9'::jsonb, 'number', 'ai_notes', 'Soglia copertura registrazione', 'Sotto questa quota (fra 0 e 1) una voce è considerata parzialmente registrata nel riepilogo finale.'),
  ('AVAILABILITY_MAX_SLOTS', '50'::jsonb, 'number', 'prenotazioni', 'Fasce di disponibilità massime', 'Quante fasce settimanali un coach può configurare al massimo.'),
  ('AI_NOTES_GOAL_STALE_AFTER_SESSIONS', '2'::jsonb, 'number', 'ai_notes', 'Obiettivo fermo dopo N sedute', 'Dopo quante sedute senza essere ripreso un obiettivo del percorso mentale viene segnalato come fermo.'),
  ('LIVE_SESSION_SILENCE_MINUTES', '2'::jsonb, 'number', 'videochiamata', 'Silenzio prima di considerare finita una sessione (minuti)', 'Da quanto il battito di presenza deve tacere prima che una sessione live sia considerata non più in corso.'),
  ('AVAILABILITY_BOOKING_START_STEP_MINUTES', '10'::jsonb, 'number', 'prenotazioni', 'Passo tra gli orari prenotabili (minuti)', 'La granularità degli orari di inizio proposti nel selettore di prenotazione.');
