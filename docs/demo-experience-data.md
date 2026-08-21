# Dati della demo interattiva

La demo usa due account pubblici:

- `coachdemo@kaipaicoaching.com`
- `atletademo@kaipaicoaching.com`

La landing mostra il pulsante **Demo**. Il popup consente di entrare come Coach
o come Atleta senza mostrare né trasferire password al browser. Il server
verifica prima il flag `public.users.is_demo` e i metadati Auth non modificabili
dall'utente, genera un token email monouso tramite Supabase Admin e lo scambia
immediatamente con la sessione cookie dell'utente scelto.

Il coach vede cinque atleti sintetici, ciascuno associato a uno sport diverso: Giulia Martini (calcio e account pubblico della demo), Lorenzo Conti (tennis), Elena Ferri (curling), Sofia Bianchi (karate) e Marco De Santis (sci alpino). Gli ultimi quattro hanno identità Auth tecniche perché `public.users.auth_id` è una FK obbligatoria, ma non vengono presentati come credenziali di accesso.

## Contenuto

Il comando crea o sincronizza esclusivamente righe marcate come demo:

- profili completi e immagini sintetiche in `public/demo/`;
- profilo coach approvato, servizi, disponibilità ed entitlement Appunti AI;
- cinque profili atleta, tre obiettivi di percorso per atleta;
- sedici sessioni concluse e cinque sessioni future;
- consenso sintetico, 192 segmenti di trascrizione, timeline normalizzate;
- sedici Session Compass validati con il contratto di produzione;
- note private del coach, bookmark, impegni e audit essenziali;
- chat delle prossime sessioni, recensioni con risposta e notifiche.

Tutti i contenuti sono inventati. Nessuna registrazione audio fittizia viene inserita: i transcript sono marcati `synthetic` e non puntano a oggetti Storage inesistenti.

## Uso sicuro

Il database locale è produzione. Il comando è quindi in dry-run per impostazione predefinita:

```powershell
npm run demo:seed
```

Per applicare, fornire una password server-side di almeno 16 caratteri e aggiungere `--apply`:

```powershell
$env:KAIPAI_DEMO_PASSWORD = '<segreto-server-side>'
npm run demo:seed -- --apply
```

La password viene assegnata soltanto alle identità Auth create in quel momento. Le credenziali degli account demo già esistenti restano invariate. Per reimpostarle intenzionalmente usare anche `--reset-passwords`.

Verifica in sola lettura:

```powershell
npm run demo:seed -- --verify
```

In Supabase Auth ogni identità porta in `app_metadata`:

```json
{
  "kaipai_demo": true,
  "demo_readonly": true
}
```

La stessa identità è replicata nel flag server-side `public.users.is_demo`, usato
per escludere gli account e la loro attività da:

- statistiche pubbliche della landing;
- marketplace e profili coach pubblici;
- menu di selezione coach e atleta degli account reali.

Gli account demo ricevono liste di selezione vuote, così non possono vedere
utenti reali attraverso i flussi “Nuovo appuntamento”.

Il guard applicativo usa `public.users.is_demo` come fonte autorevole e blocca
prima dell'accesso in scrittura tutte le mutazioni autenticate provenienti da
Server Actions, API web e API mobile. Restano consentiti soltanto lettura,
navigazione e logout. La dashboard mostra inoltre un avviso permanente di
modalità demo in sola lettura. I controlli di scrittura rimangono visibili per
mostrare le funzionalità disponibili, ma appaiono disabilitati e, se azionati,
spiegano che la demo non può essere modificata.
