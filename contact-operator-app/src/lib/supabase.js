import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variabili Supabase mancanti. Controlla .env.local');
}

if (!supabaseUrl.startsWith('https://')) {
  throw new Error('VITE_SUPABASE_URL non valido. Usa l\'URL progetto (https://<project-ref>.supabase.co).');
}

if (supabaseAnonKey.startsWith('sb_secret_')) {
  throw new Error(
    'Chiave Supabase secret rilevata nel frontend. Usa solo la chiave pubblica anon/publishable in VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

