// The shared course backup (supabase/course_backup.sql): the only code that
// touches it. Courses members pick from OpenGolfAPI are saved there; when
// OpenGolfAPI is down, courseSearch.js falls back to these.
import { supabase } from './supabase.js';
import { keyWords } from './fuzzy.js';

// Save a course as OpenGolfAPI returned it. Never throws (a backup must not
// get in the way of picking a course).
export function backupCourse(id, detail) {
  supabase
    .rpc('save_course_backup', { p_id: String(id), p_detail: detail })
    .then(() => {}, () => {});
}

// Search results shaped like courseSearch's toResult, from the backup.
export async function searchBackup(query, limit = 15) {
  const words = [...new Set(keyWords(query).filter((w) => w.length >= 3))].slice(0, 4);
  const terms = words.length ? words : [query.trim()];
  const or = terms.map((w) => `name.ilike.%${w.replace(/[%,()*]/g, '')}%`).join(',');
  const { data, error } = await supabase.from('course_backup').select('id, name, place, lat, lng, detail').or(or).limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []).slice(0, limit * 2).map((r) => ({
    id: r.id,
    name: r.name,
    place: r.place,
    holes: r.detail?.holes ?? null,
    par: r.detail?.par ?? null,
    lat: r.lat,
    lng: r.lng,
    type: r.detail?.type ?? '',
    backup: true,
  }));
}

// A course's saved OpenGolfAPI answer, or null.
export async function loadBackup(id) {
  const { data, error } = await supabase.from('course_backup').select('detail').eq('id', String(id)).maybeSingle();
  if (error || !data) return null;
  return data.detail;
}
