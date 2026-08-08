-- Una sola registrazione viva per traccia.
--
-- La migrazione 0043 ha sostituito l'unicità su (sessione, traccia) con una
-- su (sessione, traccia, segment_order), affermando che «due registrazioni
-- contemporanee sulla stessa traccia restano impossibili, perché il segmento
-- avrebbe lo stesso ordine». Non è così: il trigger
-- `attach_audio_segment_to_participant_recording` assegna sempre
-- `MAX(segment_order) + 1`, quindi una seconda riga sulla stessa traccia
-- ottiene sempre un ordine diverso e quel vincolo non scatta mai.
--
-- Il risultato era che il database non impediva più due registrazioni
-- simultanee dello stesso microfono, e due registrazioni dello stesso parlato
-- significano due trascrizioni dello stesso parlato: testo duplicato nella
-- timeline e nel riepilogo, senza che nulla lo segnali. L'unica protezione
-- rimasta era applicativa, dentro `reserveTracks`.
--
-- Questo indice ripristina la garanzia che la 0043 credeva di dare, nella
-- forma corretta: al massimo una registrazione *viva* per traccia, mentre i
-- segmenti già conclusi restano quanti servono. È esattamente il modello che
-- serve a far riprendere una registrazione dopo una riconnessione senza
-- permettere di aprirne due in parallelo.
CREATE UNIQUE INDEX "session_audio_recordings_live_track_unique"
  ON "session_audio_recordings" ("session_ai_notes_id", "livekit_track_sid")
  WHERE "status" IN ('pending', 'starting', 'recording', 'stopping');
