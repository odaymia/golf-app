// Owner dashboard data (supabase/admin_stats.sql). Only owner accounts
// (public.app_admins) get anything back.
import { supabase } from './supabase.js';

export async function amIAdmin() {
  const { data, error } = await supabase.rpc('am_i_admin');
  if (error) throw new Error(/am_i_admin/.test(error.message) ? 'Run supabase/admin_stats.sql in Supabase first.' : error.message);
  return !!data;
}

export async function loadAdminStats() {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw new Error(error.message);
  return data;
}

// Every account (owners only): [{ user_id, email, name, username, joined,
// last_seen, active_days_30, leagues }], newest first.
export async function loadAdminUsers() {
  const { data, error } = await supabase.rpc('admin_users');
  if (error) throw new Error(/admin_users/.test(error.message) ? 'Run the latest supabase/admin_stats.sql to see the user list.' : error.message);
  return data ?? [];
}
