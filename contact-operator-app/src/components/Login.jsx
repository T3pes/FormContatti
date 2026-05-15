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
      const normalized = (error.message || '').toLowerCase();
      if (normalized.includes('email not confirmed')) {
        setErrorMessage('Email non confermata. Apri Supabase > Authentication > Users e conferma l\'utente.');
      } else if (normalized.includes('invalid login credentials')) {
        setErrorMessage('Credenziali non valide. Verifica email/password o esegui reset password da Supabase.');
      } else {
        setErrorMessage(error.message || 'Errore di accesso.');
      }
      console.error('Supabase login error:', error);
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

