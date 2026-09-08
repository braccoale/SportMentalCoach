-- Le chiavi NOTIFICATION_REMINDER_24H_LEAD_MINUTES e NOTIFICATION_REMINDER_1H_LEAD_MINUTES
-- controllano SOLO quando parte l'email di promemoria. Il testo dell'email
-- (lib/core/email/default-templates.ts) dice letteralmente "domani" e "tra un'ora":
-- se un admin cambia l'anticipo (es. a 720 minuti) il testo non si aggiorna da solo
-- e diventa fuorviante per l'atleta. NOTIFICATION_REMINDER_WINDOW_TOLERANCE_MINUTES
-- ha già un avviso simile in produzione (0067); qui estendiamo lo stesso avviso
-- alle due chiavi di anticipo. Aggiorna solo la colonna description, additiva.
UPDATE system_config
SET description = description || ' Attenzione: il testo dell''email ("domani"/"tra un''ora") non si aggiorna da solo — un valore molto diverso da quello di default rende il testo fuorviante.'
WHERE key IN ('NOTIFICATION_REMINDER_24H_LEAD_MINUTES', 'NOTIFICATION_REMINDER_1H_LEAD_MINUTES');
