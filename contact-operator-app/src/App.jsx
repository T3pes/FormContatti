import { useEffect, useState } from 'react';
import './App.css';
import Login from './components/Login';
import ContactForm from './components/ContactForm';
import ContactList from './components/ContactList';
import { supabase } from './lib/supabase';

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
      if (!newSession) {
        setProfile(null);
        setContacts([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    async function loadData() {
      await loadProfile(user.id);
      await loadContacts();
    }

    loadData();
  }, [user?.id]);

  async function loadProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      console.error(error);
      setProfile(null);
      return;
    }

    setProfile(data);
  }

  async function loadContacts() {
    setLoadingContacts(true);

    const query = supabase
      .from('contacts_with_operator')
      .select('*')
      .order('created_at', { ascending: false });

    let { data, error } = await query;

    // Fallback per chi non ha ancora creato la view contacts_with_operator.
    if (error?.code === 'PGRST205' || error?.message?.includes('contacts_with_operator')) {
      const fallback = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

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
          key={selectedContact?.id || 'new-contact'}
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

