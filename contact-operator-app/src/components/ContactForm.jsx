import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const initialForm = {
  nome: '',
  cognome: '',
  societa: '',
  note: '',
};

function formFromSelectedContact(selectedContact) {
  if (!selectedContact) return initialForm;

  return {
    nome: selectedContact.nome || '',
    cognome: selectedContact.cognome || '',
    societa: selectedContact.societa || '',
    note: selectedContact.note || '',
  };
}

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
  if (!ALLOWED_TYPES.includes(file.type)) return 'Formato non valido. Usa JPG, PNG o WEBP.';
  if (file.size > MAX_FILE_SIZE) return 'File troppo grande. Massimo consentito: 5 MB.';
  return '';
}
export default function ContactForm({ user, selectedContact, onSaved, onCancelEdit }) {
  const [form, setForm] = useState(() => formFromSelectedContact(selectedContact));
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isEditing = Boolean(selectedContact?.id);
  const title = useMemo(() => (isEditing ? 'Modifica contatto' : 'Nuovo contatto'), [isEditing]);
  function resetForm() {
    setForm(initialForm);
    setFile(null);
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
    setFile(event.target.files?.[0] || null);
  }
  async function uploadBusinessCard({ contactId, ownerId }) {
    if (!file) {
      return {
        path: selectedContact?.business_card_path || null,
        filename: selectedContact?.business_card_filename || null,
        mime: selectedContact?.business_card_mime || null,
        size: selectedContact?.business_card_size ?? null,
      };
    }
    const fileError = validateFile(file);
    if (fileError) throw new Error(fileError);
    const safeName = sanitizeFilename(file.name);
    const storagePath = `${ownerId}/${contactId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('business-cards').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (uploadError) throw new Error(`Errore upload foto: ${uploadError.message}`);
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

  async function rollbackUploadedFileIfNeeded(path) {
    if (!path || (isEditing && selectedContact?.business_card_path === path)) return;
    await supabase.storage.from('business-cards').remove([path]);
  }

  async function handleSubmit(mode) {
    setLoading(true);
    setMessage('');
    setErrorMessage('');
    let uploadedPath = '';
    try {
      if (!form.nome.trim() || !form.cognome.trim() || !form.societa.trim()) {
        setErrorMessage('Nome, cognome e societa sono obbligatori.');
        return;
      }
      if (file) {
        const fileError = validateFile(file);
        if (fileError) {
          setErrorMessage(fileError);
          return;
        }
      }
      const contactId = selectedContact?.id || crypto.randomUUID();
      const ownerId = selectedContact?.operator_id || user.id;
      const uploadedFile = await uploadBusinessCard({ contactId, ownerId });
      uploadedPath = uploadedFile.path;
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
        const { error } = await supabase.from('contacts').update(payload).eq('id', selectedContact.id);
        if (error) {
          await rollbackUploadedFileIfNeeded(uploadedFile.path);
          setErrorMessage(error.message || 'Errore durante l\'aggiornamento del contatto.');
          return;
        }
        await removeOldBusinessCardIfNeeded(uploadedFile.path);
        setMessage('Contatto aggiornato correttamente.');
      } else {
        const { error } = await supabase.from('contacts').insert(payload);
        if (error) {
          await rollbackUploadedFileIfNeeded(uploadedFile.path);
          setErrorMessage(error.message || 'Errore durante il salvataggio del contatto.');
          return;
        }
        setMessage('Contatto salvato correttamente.');
      }
      onSaved();
      if (!isEditing && mode === 'new') resetForm();
    } catch (error) {
      await rollbackUploadedFileIfNeeded(uploadedPath);
      setErrorMessage(error?.message || 'Errore durante il salvataggio.');
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
              ? 'Modifica i dati e salva. La foto puo essere sostituita.'
              : 'Compila, salva e passa subito al contatto successivo.'}
          </p>
        </div>
        {isEditing && (
          <button type="button" className="secondary-button" onClick={onCancelEdit}>
            Annulla modifica
          </button>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit('save');
        }}
        className="contact-form"
      >
        <div className="grid-2">
          <label>
            Nome *
            <input name="nome" value={form.nome} onChange={handleChange} required maxLength={120} />
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
          Societa *
          <input name="societa" value={form.societa} onChange={handleChange} required maxLength={180} />
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
          Foto biglietto da visita (opzionale)
          <input
            id="business-card-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
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
            {loading ? 'Salvataggio...' : isEditing ? 'Salva modifiche' : 'Salva contatto'}
          </button>
          {!isEditing && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleSubmit('new')}
              disabled={loading}
            >
              Salva e nuovo
            </button>
          )}
          {!isEditing && (
            <button type="button" className="secondary-button" onClick={resetForm} disabled={loading}>
              Pulisci form
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
