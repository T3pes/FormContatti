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

  // BOM UTF-8 per compatibilita con Excel in ambiente locale italiano.
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

