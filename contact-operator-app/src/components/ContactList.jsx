import { supabase } from '../lib/supabase';
import { exportContactsToCsv, exportContactsToXlsx } from '../utils/exportContacts';
function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('it-IT');
}
export default function ContactList({ contacts, loading, onEdit, onDeleted, isAdmin }) {
  async function openBusinessCard(contact) {
    if (!contact.business_card_path) {
      window.alert('Nessuna foto associata a questo contatto.');
      return;
    }

    const { data, error } = await supabase.storage
      .from('business-cards')
      .createSignedUrl(contact.business_card_path, 60);
    if (error) {
      window.alert('Impossibile aprire la foto.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }
  async function handleDelete(contact) {
    const confirmDelete = window.confirm(
      `Vuoi cancellare definitivamente ${contact.nome} ${contact.cognome}?`
    );
    if (!confirmDelete) return;
    const { error: deleteRowError } = await supabase.from('contacts').delete().eq('id', contact.id);
    if (deleteRowError) {
      window.alert(`Errore cancellazione contatto: ${deleteRowError.message}`);
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
            {isAdmin ? ' - vista admin globale' : ' - vista operatore'}
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
                <th>Societa</th>
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
                    {contact.business_card_path ? (
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => openBusinessCard(contact)}
                      >
                        Apri
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="small-button" onClick={() => onEdit(contact)}>
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
