# Web app contatti operatori

Web app React + Vite con Supabase Auth, Database e Storage per gestire contatti raccolti da operatori autenticati.

## Funzionalita

- Login operatore (email/password)
- Inserimento contatto con: nome, cognome, societa, note, foto biglietto
- Modifica e cancellazione contatti
- Associazione automatica del contatto all'utente loggato
- Export CSV (delimitatore `;`) e XLSX
- Vista admin globale (se profilo con ruolo `admin`)

## Stack

- React
- Vite
- Supabase (`auth`, `postgres`, `storage`)
- `xlsx` per export Excel

## Configurazione rapida

1. Copia `.env.example` in `.env.local`
2. Inserisci URL e chiave anon pubblica Supabase
3. Esegui lo SQL in `supabase/schema.sql` dal SQL Editor Supabase
4. Crea utenti in Supabase Authentication

`.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

## Script

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Note sicurezza

- Non usare mai `service_role` nel frontend
- Bucket `business-cards` privato con policy RLS
- Ogni operatore vede solo i propri contatti (admin escluso)
