# Web app contatti operatori — React + Vite + Supabase

## 1. Obiettivo reale del progetto

Realizzare una web app semplice, veloce e pratica per operatori autenticati.

Ogni operatore deve poter:

- fare login con email e password;
- compilare un form contatto;
- inserire:
  - Nome;
  - Cognome;
  - Società;
  - Note;
  - Foto del biglietto da visita;
- salvare il contatto;
- modificare un contatto già salvato;
- cancellare un contatto;
- salvare e passare subito al contatto successivo;
- scaricare i dati in:
  - CSV compatibile Excel con separatore `;`;
  - file `.xlsx` Excel vero.

Ogni contatto deve essere legato all'operatore che lo ha creato.

La foto del biglietto da visita deve essere salvata in Supabase Storage e collegata al record del database.

---

## 2. Stack tecnico

- Frontend: React
- Build tool: Vite
- Database: Supabase PostgreSQL
- Autenticazione: Supabase Auth email/password
- Storage immagini: Supabase Storage
- Export CSV/XLSX: JavaScript lato browser
- Hosting consigliato: Vercel

---

## 3. Logica funzionale dell'app

Flusso operativo:

1. L'operatore apre la web app.
2. Se non è loggato, vede solo la schermata login.
3. Dopo il login, accede al pannello contatti.
4. Compila il form:
   - nome;
   - cognome;
   - società;
   - note;
   - foto biglietto da visita.
5. Clicca su `Salva contatto` oppure `Salva e nuovo`.
6. L'app:
   - genera un ID contatto;
   - carica la foto nel bucket Supabase `business-cards`;
   - salva il record nella tabella `contacts`;
   - collega il record all'operatore tramite `operator_id = auth.uid()`.
7. L'operatore vede la lista dei propri contatti.
8. Può modificare un contatto.
9. Può sostituire la foto.
10. Può cancellare un contatto e la relativa foto.
11. Può esportare i contatti in CSV `;` oppure XLSX.

Regola di sicurezza:

- ogni operatore vede solo i propri contatti;
- un admin può vedere tutti i contatti;
- nessun utente anonimo può leggere, creare, modificare o cancellare dati;
- il bucket delle immagini è privato;
- il frontend usa solo la chiave pubblica Supabase;
- la `service_role key` non deve mai finire nel frontend.

---

## 4. Struttura finale del progetto

```text
contact-operator-app/
├─ .env.local
├─ .env.example
├─ .gitignore
├─ index.html
├─ package.json
├─ vite.config.js
├─ src/
│  ├─ App.jsx
│  ├─ App.css
│  ├─ main.jsx
│  ├─ components/
│  │  ├─ Login.jsx
│  │  ├─ ContactForm.jsx
│  │  └─ ContactList.jsx
│  ├─ lib/
│  │  └─ supabase.js
│  └─ utils/
│     └─ exportContacts.js
└─ README.md
```

---

## 5. Prerequisiti

Installare:

- Node.js LTS;
- npm;
- account Supabase;
- account GitHub;
- account Vercel.

Verifica installazione:

```bash
node -v
npm -v
```

Se i comandi non funzionano, installare Node.js LTS e riaprire il terminale.

---

## 6. Creazione progetto React + Vite

Da terminale:

```bash
npm create vite@latest contact-operator-app -- --template react
cd contact-operator-app
npm install
npm install @supabase/supabase-js xlsx
```

Avvio locale:

```bash
npm run dev
```

Aprire:

```text
http://localhost:5173
```

---

## 7. Creazione progetto Supabase

Su Supabase:

```text
Dashboard Supabase → New Project
```

Dopo la creazione recuperare:

```text
Project Settings → API
```

Servono:

- Project URL;
- anon public key oppure publishable key.

Non usare mai nel frontend:

```text
service_role key
```

---

## 8. Configurazione autenticazione Supabase

Aprire:

```text
Supabase Dashboard → Authentication → Providers → Email
```

Impostazione consigliata:

- Email provider: attivo;
- Confirm email: a scelta;
- Sign up pubblico: sconsigliato per questa app;
- operatori creati manualmente da dashboard.

Per creare un operatore:

```text
Supabase Dashboard → Authentication → Users → Add user
```

Inserire:

- email operatore;
- password temporanea;
- confermare utente se necessario.

Per questa versione non mettiamo registrazione pubblica nella web app. È più sicuro: entra solo chi viene creato come operatore.

---

## 9. File ambiente

Nella root del progetto creare:

```text
.env.local
```

Contenuto:

```env
VITE_SUPABASE_URL=https://INSERISCI_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=INSERISCI_LA_CHIAVE_PUBBLICA
```

Creare anche:

```text
.env.example
```

Contenuto:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Aggiornare `.gitignore`:

```gitignore
node_modules
.env
.env.local
.env.*.local
dist
```

Nota secca: le variabili con prefisso `VITE_` sono visibili al browser. Quindi dentro ci va solo la chiave pubblica Supabase, mai la chiave admin.

---

## 10. Database Supabase completo

Aprire:

```text
Supabase Dashboard → SQL Editor → New query
```

Incollare tutto questo SQL ed eseguirlo.

```sql
create extension if not exists pgcrypto;

-- =========================================================
-- PROFILI OPERATORI / ADMIN
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Funzione per capire se l'utente corrente è admin.
-- Serve nelle policy RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Crea automaticamente il profilo quando viene creato un utente auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'operator'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill: crea il profilo anche per eventuali utenti già esistenti.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  'operator'
from auth.users u
on conflict (id) do nothing;

-- Policy profiles

drop policy if exists "profiles_select_self_or_admin" on public.profiles;

create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

-- Nota: nessuna policy UPDATE/INSERT/DELETE su profiles per il frontend.
-- I ruoli si gestiscono da SQL Editor o Dashboard, non dalla web app.

-- =========================================================
-- TABELLA CONTATTI
-- =========================================================

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  operator_id uuid not null references auth.users(id) on delete cascade,

  nome text not null,
  cognome text not null,
  societa text not null,
  note text not null default '',

  business_card_path text not null,
  business_card_filename text not null,
  business_card_mime text not null,
  business_card_size integer not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_operator_id_idx
on public.contacts(operator_id);

create index if not exists contacts_created_at_idx
on public.contacts(created_at desc);

alter table public.contacts enable row level security;

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- Policy contacts

drop policy if exists "contacts_select_own_or_admin" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own_or_admin" on public.contacts;
drop policy if exists "contacts_delete_own_or_admin" on public.contacts;

create policy "contacts_select_own_or_admin"
on public.contacts
for select
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
);

create policy "contacts_insert_own"
on public.contacts
for insert
to authenticated
with check (
  operator_id = auth.uid()
  and length(trim(nome)) between 1 and 120
  and length(trim(cognome)) between 1 and 120
  and length(trim(societa)) between 1 and 180
  and length(trim(note)) <= 3000
  and business_card_mime in ('image/jpeg', 'image/png', 'image/webp')
  and business_card_size <= 5242880
);

create policy "contacts_update_own_or_admin"
on public.contacts
for update
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
)
with check (
  (operator_id = auth.uid() or public.is_admin())
  and length(trim(nome)) between 1 and 120
  and length(trim(cognome)) between 1 and 120
  and length(trim(societa)) between 1 and 180
  and length(trim(note)) <= 3000
  and business_card_mime in ('image/jpeg', 'image/png', 'image/webp')
  and business_card_size <= 5242880
);

create policy "contacts_delete_own_or_admin"
on public.contacts
for delete
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
);

-- =========================================================
-- STORAGE BUCKET FOTO BIGLIETTI DA VISITA
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'business-cards',
  'business-cards',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policy Storage.
-- Percorso file previsto:
-- business-cards/{user_id}/{contact_id}/{filename}

-- Pulizia policy precedenti, se esistono.
drop policy if exists "business_cards_select_own_or_admin" on storage.objects;
drop policy if exists "business_cards_insert_own_folder" on storage.objects;
drop policy if exists "business_cards_update_own_or_admin" on storage.objects;
drop policy if exists "business_cards_delete_own_or_admin" on storage.objects;

create policy "business_cards_select_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "business_cards_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "business_cards_update_own_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "business_cards_delete_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
```

---

## 11. Come rendere un utente admin

Dopo aver creato l'utente da:

```text
Authentication → Users → Add user
```

andare in SQL Editor ed eseguire:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

Sostituire `admin@example.com` con l'email reale.

Differenza pratica:

- `operator`: vede solo i propri contatti;
- `admin`: vede tutti i contatti.

---

## 12. Codice frontend

### 12.1 `src/lib/supabase.js`

Creare la cartella:

```bash
mkdir -p src/lib
```

Creare il file:

```text
src/lib/supabase.js
```

Contenuto:

```js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variabili Supabase mancanti. Controlla .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

### 12.2 `src/utils/exportContacts.js`

Creare la cartella:

```bash
mkdir -p src/utils
```

Creare il file:

```text
src/utils/exportContacts.js
```

Contenuto:

```js
import * as XLSX from 'xlsx';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('it-IT');
}

function safeFileDate() {
  return new Date().toISOString().slice(0, 19).replaceAll(':', '-');
}

function csvEscape(value) {
  const cleanValue = value === null || value === undefined ? '' : String(value);
  return `"${cleanValue.replaceAll('"', '""')}"`;
}

function normalizeContact(contact) {
  return {
    Nome: contact.nome,
    Cognome: contact.cognome,
    Societa: contact.societa,
    Note: contact.note,
    Operatore: contact.operator_email || contact.operator_id || '',
    FotoBiglietto: contact.business_card_filename,
    PercorsoFoto: contact.business_card_path,
    CreatoIl: formatDate(contact.created_at),
    AggiornatoIl: formatDate(contact.updated_at),
  };
}

export function exportContactsToCsv(contacts) {
  const rows = contacts.map(normalizeContact);

  const headers = [
    'Nome',
    'Cognome',
    'Societa',
    'Note',
    'Operatore',
    'FotoBiglietto',
    'PercorsoFoto',
    'CreatoIl',
    'AggiornatoIl',
  ];

  const csvRows = [
    headers.map(csvEscape).join(';'),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(';')),
  ];

  // BOM UTF-8: aiuta Excel ad aprire correttamente accenti e caratteri italiani.
  const csvContent = `\uFEFF${csvRows.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contatti_${safeFileDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportContactsToXlsx(contacts) {
  const rows = contacts.map(normalizeContact);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatti');
  XLSX.writeFile(workbook, `contatti_${safeFileDate()}.xlsx`);
}
```

---

### 12.3 `src/components/Login.jsx`

Creare la cartella:

```bash
mkdir -p src/components
```

Creare il file:

```text
src/components/Login.jsx
```

Contenuto:

```jsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage('Credenziali non valide o utente non abilitato.');
    }

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Accesso operatori</h1>
        <p>Inserisci email e password per compilare i contatti.</p>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {errorMessage && <div className="error-box">{errorMessage}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
      </section>
    </main>
  );
}
```

---

### 12.4 `src/components/ContactForm.jsx`

Creare il file:

```text
src/components/ContactForm.jsx
```

Contenuto:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const initialForm = {
  nome: '',
  cognome: '',
  societa: '',
  note: '',
};

function sanitizeFilename(filename) {
  return filename
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function validateFile(file) {
  if (!file) return 'Carica la foto del biglietto da visita.';

  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Formato non valido. Usa JPG, PNG o WEBP.';
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'File troppo grande. Massimo consentito: 5 MB.';
  }

  return '';
}

export default function ContactForm({ user, selectedContact, onSaved, onCancelEdit }) {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isEditing = Boolean(selectedContact?.id);

  const title = useMemo(() => {
    return isEditing ? 'Modifica contatto' : 'Nuovo contatto';
  }, [isEditing]);

  useEffect(() => {
    if (selectedContact) {
      setForm({
        nome: selectedContact.nome || '',
        cognome: selectedContact.cognome || '',
        societa: selectedContact.societa || '',
        note: selectedContact.note || '',
      });
      setFile(null);
      setMessage('');
      setErrorMessage('');
    } else {
      resetForm();
    }
  }, [selectedContact]);

  function resetForm() {
    setForm(initialForm);
    setFile(null);
    setLoading(false);
    setMessage('');
    setErrorMessage('');

    const input = document.getElementById('business-card-file');
    if (input) input.value = '';
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  }

  async function uploadBusinessCard({ contactId, ownerId }) {
    if (!file) {
      return {
        path: selectedContact?.business_card_path || '',
        filename: selectedContact?.business_card_filename || '',
        mime: selectedContact?.business_card_mime || '',
        size: selectedContact?.business_card_size || 0,
      };
    }

    const fileError = validateFile(file);
    if (fileError) throw new Error(fileError);

    const safeName = sanitizeFilename(file.name);
    const storagePath = `${ownerId}/${contactId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('business-cards')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(`Errore upload foto: ${uploadError.message}`);
    }

    return {
      path: storagePath,
      filename: file.name,
      mime: file.type,
      size: file.size,
    };
  }

  async function removeOldBusinessCardIfNeeded(newPath) {
    const oldPath = selectedContact?.business_card_path;

    if (!oldPath || !newPath || oldPath === newPath) return;

    await supabase.storage.from('business-cards').remove([oldPath]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (!form.nome.trim() || !form.cognome.trim() || !form.societa.trim()) {
        throw new Error('Nome, cognome e società sono obbligatori.');
      }

      if (!isEditing && !file) {
        throw new Error('Per un nuovo contatto devi caricare la foto del biglietto da visita.');
      }

      if (file) {
        const fileError = validateFile(file);
        if (fileError) throw new Error(fileError);
      }

      const contactId = selectedContact?.id || crypto.randomUUID();
      const ownerId = selectedContact?.operator_id || user.id;
      const uploadedFile = await uploadBusinessCard({ contactId, ownerId });

      const payload = {
        id: contactId,
        operator_id: ownerId,
        nome: form.nome.trim(),
        cognome: form.cognome.trim(),
        societa: form.societa.trim(),
        note: form.note.trim(),
        business_card_path: uploadedFile.path,
        business_card_filename: uploadedFile.filename,
        business_card_mime: uploadedFile.mime,
        business_card_size: uploadedFile.size,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('contacts')
          .update(payload)
          .eq('id', selectedContact.id);

        if (error) throw error;

        await removeOldBusinessCardIfNeeded(uploadedFile.path);
        setMessage('Contatto aggiornato correttamente.');
      } else {
        const { error } = await supabase.from('contacts').insert(payload);

        if (error) {
          if (uploadedFile.path) {
            await supabase.storage.from('business-cards').remove([uploadedFile.path]);
          }
          throw error;
        }

        setMessage('Contatto salvato. Puoi inserire il successivo.');
      }

      resetForm();
      onSaved();
    } catch (error) {
      setErrorMessage(error.message || 'Errore durante il salvataggio.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>
            {isEditing
              ? 'Modifica i dati e salva. La foto può essere sostituita.'
              : 'Compila, salva e passa subito al contatto successivo.'}
          </p>
        </div>

        {isEditing && (
          <button type="button" className="secondary-button" onClick={onCancelEdit}>
            Annulla modifica
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="contact-form">
        <div className="grid-2">
          <label>
            Nome *
            <input
              name="nome"
              value={form.nome}
              onChange={handleChange}
              required
              maxLength={120}
            />
          </label>

          <label>
            Cognome *
            <input
              name="cognome"
              value={form.cognome}
              onChange={handleChange}
              required
              maxLength={120}
            />
          </label>
        </div>

        <label>
          Società *
          <input
            name="societa"
            value={form.societa}
            onChange={handleChange}
            required
            maxLength={180}
          />
        </label>

        <label>
          Note
          <textarea
            name="note"
            value={form.note}
            onChange={handleChange}
            rows="5"
            maxLength={3000}
            placeholder="Inserisci informazioni utili, recapiti, dettagli commerciali, promemoria..."
          />
        </label>

        <label>
          Foto biglietto da visita {isEditing ? '(opzionale se già presente)' : '*'}
          <input
            id="business-card-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            required={!isEditing}
          />
        </label>

        {selectedContact?.business_card_filename && !file && (
          <p className="muted">
            Foto attuale: <strong>{selectedContact.business_card_filename}</strong>
          </p>
        )}

        {file && (
          <p className="muted">
            Nuova foto selezionata: <strong>{file.name}</strong>
          </p>
        )}

        {errorMessage && <div className="error-box">{errorMessage}</div>}
        {message && <div className="success-box">{message}</div>}

        <div className="actions-row">
          <button type="submit" disabled={loading}>
            {loading ? 'Salvataggio...' : isEditing ? 'Salva modifiche' : 'Salva e nuovo'}
          </button>

          {!isEditing && (
            <button type="button" className="secondary-button" onClick={resetForm}>
              Pulisci form
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
```

---

### 12.5 `src/components/ContactList.jsx`

Creare il file:

```text
src/components/ContactList.jsx
```

Contenuto:

```jsx
import { supabase } from '../lib/supabase';
import { exportContactsToCsv, exportContactsToXlsx } from '../utils/exportContacts';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('it-IT');
}

export default function ContactList({ contacts, loading, onEdit, onDeleted, isAdmin }) {
  async function openBusinessCard(contact) {
    const { data, error } = await supabase.storage
      .from('business-cards')
      .createSignedUrl(contact.business_card_path, 60);

    if (error) {
      alert('Impossibile aprire la foto.');
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleDelete(contact) {
    const confirmDelete = window.confirm(
      `Vuoi cancellare definitivamente ${contact.nome} ${contact.cognome}?`
    );

    if (!confirmDelete) return;

    const { error: deleteRowError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contact.id);

    if (deleteRowError) {
      alert(`Errore cancellazione contatto: ${deleteRowError.message}`);
      return;
    }

    if (contact.business_card_path) {
      await supabase.storage.from('business-cards').remove([contact.business_card_path]);
    }

    onDeleted();
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Contatti salvati</h2>
        <p>Caricamento contatti...</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Contatti salvati</h2>
          <p>
            {contacts.length} contatti trovati
            {isAdmin ? ' — vista admin globale' : ' — vista operatore'}
          </p>
        </div>

        <div className="actions-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportContactsToCsv(contacts)}
            disabled={contacts.length === 0}
          >
            Esporta CSV ;
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => exportContactsToXlsx(contacts)}
            disabled={contacts.length === 0}
          >
            Esporta Excel
          </button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="empty-box">Nessun contatto salvato.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cognome</th>
                <th>Società</th>
                <th>Note</th>
                {isAdmin && <th>Operatore</th>}
                <th>Creato</th>
                <th>Foto</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.nome}</td>
                  <td>{contact.cognome}</td>
                  <td>{contact.societa}</td>
                  <td className="note-cell">{contact.note}</td>
                  {isAdmin && <td>{contact.operator_email || contact.operator_id}</td>}
                  <td>{formatDate(contact.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => openBusinessCard(contact)}
                    >
                      Apri
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => onEdit(contact)}
                      >
                        Modifica
                      </button>

                      <button
                        type="button"
                        className="small-button danger-button"
                        onClick={() => handleDelete(contact)}
                      >
                        Cancella
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

---

### 12.6 `src/App.jsx`

Sostituire tutto il contenuto di:

```text
src/App.jsx
```

con:

```jsx
import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import ContactForm from './components/ContactForm';
import ContactList from './components/ContactList';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const user = session?.user || null;
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoadingAuth(false);
    }

    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSelectedContact(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setContacts([]);
      return;
    }

    loadProfileAndContacts();
  }, [user?.id]);

  async function loadProfileAndContacts() {
    await loadProfile();
    await loadContacts();
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error(error);
      setProfile(null);
      return;
    }

    setProfile(data);
  }

  async function loadContacts() {
    setLoadingContacts(true);

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setContacts([]);
    } else {
      setContacts(data || []);
    }

    setLoadingContacts(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setContacts([]);
    setSelectedContact(null);
  }

  function handleSaved() {
    setSelectedContact(null);
    loadContacts();
  }

  if (loadingAuth) {
    return <div className="loading-page">Caricamento...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Gestione contatti</h1>
          <p>
            Operatore: <strong>{user.email}</strong>
            {isAdmin && <span className="admin-badge">Admin</span>}
          </p>
        </div>

        <button type="button" className="secondary-button" onClick={handleLogout}>
          Esci
        </button>
      </header>

      <div className="layout">
        <ContactForm
          user={user}
          selectedContact={selectedContact}
          onSaved={handleSaved}
          onCancelEdit={() => setSelectedContact(null)}
        />

        <ContactList
          contacts={contacts}
          loading={loadingContacts}
          onEdit={setSelectedContact}
          onDeleted={loadContacts}
          isAdmin={isAdmin}
        />
      </div>
    </main>
  );
}
```

---

### 12.7 `src/main.jsx`

Sostituire il contenuto con:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

### 12.8 `src/App.css`

Sostituire tutto il contenuto di:

```text
src/App.css
```

con:

```css
:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #f3f6fb;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #f3f6fb;
}

button,
input,
textarea {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.auth-page,
.loading-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.auth-card,
.panel,
.topbar {
  background: #ffffff;
  border: 1px solid #e3e8f2;
  border-radius: 18px;
  box-shadow: 0 14px 40px rgba(30, 41, 59, 0.08);
}

.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 28px;
}

.auth-card h1,
.panel h2,
.topbar h1 {
  margin: 0 0 8px;
  color: #0f172a;
}

.auth-card p,
.panel p,
.topbar p {
  margin: 0;
  color: #667085;
}

.form-stack,
.contact-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 24px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-weight: 700;
  color: #263044;
}

input,
textarea {
  width: 100%;
  border: 1px solid #cfd8e6;
  border-radius: 12px;
  padding: 12px 14px;
  background: #ffffff;
  color: #101828;
  outline: none;
}

input:focus,
textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

textarea {
  resize: vertical;
}

button[type="submit"],
.primary-button {
  background: #2563eb;
  color: #ffffff;
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 800;
}

.secondary-button,
.small-button {
  background: #edf2fb;
  color: #1e3a8a;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 800;
}

.small-button {
  padding: 8px 10px;
  font-size: 13px;
}

.danger-button {
  background: #fee2e2;
  color: #991b1b;
}

.error-box,
.success-box,
.empty-box {
  border-radius: 12px;
  padding: 12px 14px;
  font-weight: 700;
}

.error-box {
  background: #fee2e2;
  color: #991b1b;
}

.success-box {
  background: #dcfce7;
  color: #166534;
}

.empty-box {
  background: #f8fafc;
  color: #64748b;
  margin-top: 20px;
}

.app-shell {
  width: min(1500px, 100%);
  margin: 0 auto;
  padding: 24px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 22px;
  margin-bottom: 22px;
}

.admin-badge {
  display: inline-flex;
  margin-left: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  font-weight: 900;
}

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 480px) 1fr;
  gap: 22px;
  align-items: start;
}

.panel {
  padding: 22px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.actions-row,
.row-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 10px;
  vertical-align: top;
}

th {
  color: #475467;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #f8fafc;
}

.note-cell {
  max-width: 260px;
  white-space: pre-wrap;
}

.muted {
  color: #667085;
  font-size: 14px;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .app-shell {
    padding: 14px;
  }

  .topbar,
  .panel-header {
    flex-direction: column;
    align-items: stretch;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }
}
```

---

## 13. Correzione importante per vista admin con email operatore

La query `contacts` sopra recupera i contatti ma non recupera automaticamente l'email dell'operatore.

Per una versione semplice, la tabella mostra `operator_id`.

Se vuoi mostrare l'email operatore nella vista admin, crea una vista sicura.

Eseguire in SQL Editor:

```sql
create or replace view public.contacts_with_operator as
select
  c.*,
  p.email as operator_email,
  p.full_name as operator_full_name
from public.contacts c
left join public.profiles p on p.id = c.operator_id;

alter view public.contacts_with_operator set (security_invoker = true);
```

Poi in `App.jsx` sostituire la query:

```js
.from('contacts')
.select('*')
```

con:

```js
.from('contacts_with_operator')
.select('*')
```

Per un MVP puoi lasciare la query su `contacts` e ignorare l'email operatore in tabella.

---

## 14. Export CSV delimitato da punto e virgola

Il CSV viene generato lato browser.

Caratteristiche:

- separatore: `;`;
- encoding: UTF-8 con BOM;
- compatibile con Excel italiano;
- include:
  - Nome;
  - Cognome;
  - Società;
  - Note;
  - Operatore;
  - Nome file foto;
  - Percorso foto;
  - Data creazione;
  - Data modifica.

Esempio riga CSV:

```csv
"Nome";"Cognome";"Societa";"Note";"Operatore";"FotoBiglietto";"PercorsoFoto";"CreatoIl";"AggiornatoIl"
"Mario";"Rossi";"ACME SRL";"Interessato a ricontatto";"...";"biglietto.jpg";"user/contact/file.jpg";"14/05/2026, 22:00:00";"14/05/2026, 22:01:00"
```

---

## 15. Export Excel XLSX

Il file `.xlsx` viene generato con la libreria:

```bash
npm install xlsx
```

Il pulsante `Esporta Excel` produce:

```text
contatti_YYYY-MM-DDTHH-MM-SS.xlsx
```

Questo è un file Excel vero, non un CSV rinominato.

---

## 16. Comandi finali di sviluppo

Avvio locale:

```bash
npm run dev
```

Build produzione:

```bash
npm run build
```

Anteprima build:

```bash
npm run preview
```

Se il build fallisce, controllare:

```bash
npm install
npm run build
```

---

## 17. Deploy su GitHub

Inizializzare Git:

```bash
git init
git add .
git commit -m "Initial contact operator app"
```

Creare repository GitHub e poi:

```bash
git branch -M main
git remote add origin https://github.com/TUO_USERNAME/contact-operator-app.git
git push -u origin main
```

---

## 18. Deploy su Vercel

Da Vercel:

```text
Add New Project → Import GitHub Repository
```

Impostazioni:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Aggiungere variabili ambiente:

```text
Settings → Environment Variables
```

Inserire:

```env
VITE_SUPABASE_URL=https://INSERISCI_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=INSERISCI_LA_CHIAVE_PUBBLICA
```

Poi fare deploy.

---

## 19. Checklist test funzionale

### Login

- [ ] Creo un utente operatore in Supabase Auth.
- [ ] Accedo alla web app.
- [ ] Login corretto.
- [ ] Logout corretto.

### Inserimento contatto

- [ ] Compilo nome.
- [ ] Compilo cognome.
- [ ] Compilo società.
- [ ] Inserisco note.
- [ ] Carico foto JPG/PNG/WEBP.
- [ ] Salvo.
- [ ] Il form si pulisce.
- [ ] Posso inserire subito il successivo.

### Database

- [ ] Il record appare in `public.contacts`.
- [ ] `operator_id` coincide con l'utente loggato.
- [ ] `business_card_path` è valorizzato.

### Storage

- [ ] Il file appare nel bucket `business-cards`.
- [ ] Il percorso è nel formato:

```text
user_id/contact_id/nome-file
```

### Modifica

- [ ] Clicco su `Modifica`.
- [ ] Il form si riempie.
- [ ] Modifico dati.
- [ ] Salvo.
- [ ] I dati vengono aggiornati.
- [ ] Se carico nuova foto, la vecchia viene rimossa.

### Cancellazione

- [ ] Clicco su `Cancella`.
- [ ] Confermo.
- [ ] Il record sparisce dalla lista.
- [ ] La foto viene rimossa dallo Storage.

### Export

- [ ] Clicco `Esporta CSV ;`.
- [ ] Si scarica un `.csv`.
- [ ] Aprendolo con Excel, le colonne sono separate correttamente.
- [ ] Clicco `Esporta Excel`.
- [ ] Si scarica un `.xlsx`.

### Sicurezza

- [ ] Da non loggato non vedo nulla.
- [ ] Un operatore non vede i contatti di un altro operatore.
- [ ] Un admin vede tutti i contatti.
- [ ] Il bucket Storage non è pubblico.

---

## 20. Troubleshooting

### Errore: `Invalid login credentials`

Cause probabili:

- email sbagliata;
- password sbagliata;
- utente non confermato;
- utente non creato in Supabase Auth.

Controllare:

```text
Supabase → Authentication → Users
```

---

### Errore: `new row violates row-level security policy`

Cause probabili:

- l'utente non è loggato;
- `operator_id` non coincide con `auth.uid()`;
- policy SQL non eseguite correttamente;
- dati non validi, ad esempio file troppo grande o formato non consentito.

Controllare nel codice:

```js
operator_id: user.id
```

---

### Errore upload Storage

Cause probabili:

- bucket non creato;
- policy Storage mancanti;
- file sopra 5 MB;
- formato non consentito;
- path file non inizia con `user.id`.

Il path deve essere:

```js
`${ownerId}/${contactId}/${Date.now()}-${safeName}`
```

---

### Excel apre tutto in una colonna

Il CSV deve essere separato da `;`, non da `,`.

Il codice fornito usa:

```js
join(';')
```

Se Excel continua ad aprire male:

1. Aprire Excel.
2. Dati.
3. Da testo/CSV.
4. Scegliere delimitatore `;`.

---

### La foto non si apre

Il bucket è privato. È corretto.

Per aprire la foto l'app genera un link firmato temporaneo valido 60 secondi:

```js
.createSignedUrl(contact.business_card_path, 60)
```

---

## 21. Miglioramenti consigliati dopo MVP

Dopo la prima versione funzionante, aggiungere:

1. ricerca per nome, cognome o società;
2. filtro per data;
3. filtro per operatore nella vista admin;
4. campo telefono;
5. campo email;
6. campo evento/fiera di provenienza;
7. tag interesse commerciale;
8. OCR automatico del biglietto da visita;
9. dashboard riepilogativa;
10. esportazione solo per intervallo date;
11. backup giornaliero;
12. log modifiche.

---

## 22. Estensione consigliata: campo evento o fiera

Se la web app serve per raccogliere contatti durante eventi, fiere o meeting, aggiungere questo campo è intelligente.

SQL:

```sql
alter table public.contacts
add column if not exists evento text not null default '';
```

Poi aggiungere il campo nel form React.

---

## 23. Nota tecnica finale

Questa architettura è corretta per un gestionale leggero perché:

- non serve backend Node separato;
- Supabase gestisce Auth, DB, Storage e policy;
- React resta solo frontend;
- Vercel ospita la parte statica;
- i permessi sono gestiti da RLS;
- ogni operatore lavora sui propri dati;
- l'admin può avere visione globale;
- l'export viene fatto direttamente dal browser.

La parte da non sbagliare è Supabase RLS: senza policy corrette, o l'app non salva nulla, o peggio espone dati. Le policy incluse sopra sono il blocco più importante del progetto.
