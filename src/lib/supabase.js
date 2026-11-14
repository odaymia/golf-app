// Supabase client. The URL and publishable key are meant to ship in the app;
// row level security (supabase/schema.sql) is what protects the data.
// Never put the service_role / secret key here.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://qdnrmeipmggpxynggsnl.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_t1fH9gvJjS37LsKKrWqMwQ_0uVdX5ac';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true, // stay signed in, including offline on the course
    autoRefreshToken: true,
    detectSessionInUrl: false, // we sign in with a typed code, not a link
  },
});
