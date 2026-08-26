-- La data di nascita del coach.
--
-- Perche' esiste: la registrazione chiedeva la data di nascita solo agli
-- atleti. Il commento nel codice dichiarava che «chi si registra come coach
-- agisce in veste professionale», e nessuna riga lo verificava: un minorenne
-- che sceglieva «Coach» non incontrava mai la domanda. La soglia e' 18 perche'
-- un professionista approva le clausole vessatorie (artt. 1341-1342 c.c.), e
-- sotto la capacita' legale quell'accettazione e' annullabile (art. 1425 c.c.).
--
-- Nullable di proposito: i coach registrati prima di questo controllo non
-- hanno una data, e una NOT NULL li romperebbe tutti. Per loro l'eta' resta
-- ignota — scelta esplicita, documentata nella specifica
-- docs/superpowers/specs/2026-08-26-eta-coach-registrazione-design.md.
--
-- Perche' il vincolo dei 18 anni NON e' qui: dipenderebbe da CURRENT_DATE, che
-- non e' immutabile, e Postgres non lo accetta in un CHECK. La soglia vive in
-- isEligibleCoachAge() ed e' applicata dalle due server action di
-- registrazione, quella con la password e quella con Google. Il vincolo qui
-- sotto copre solo l'assurdo.
--
-- Nota per chi rigenera: `npm run db:generate` su questo repository produce un
-- CREATE TABLE per l'intero schema, perche' gli snapshot in meta/ sono
-- indietro rispetto alle migrazioni scritte a mano (0050, 0052, 0053, 0054...).
-- Lo snapshot 0059 allegato a questa migrazione riallinea il diff: da qui in
-- avanti le generazioni tornano a produrre ALTER.

ALTER TABLE "provider_profiles" ADD COLUMN "birth_date" date;
--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_birth_date_plausible"
  CHECK ("birth_date" IS NULL OR "birth_date" > DATE '1900-01-01');
