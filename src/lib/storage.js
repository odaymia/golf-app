// The only module that touches IndexedDB. Rounds and saved courses live
// on the device so the app works with no signal on the course.

const DB_NAME = 'golf-app';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rounds')) db.createObjectStore('rounds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Structured clone drops nothing we use, but strip React proxies/undefined.
const plain = (value) => JSON.parse(JSON.stringify(value));

export function saveRound(round) {
  const record = plain({ ...round, updatedAt: Date.now() });
  return run('rounds', 'readwrite', (s) => s.put(record)).then(() => record);
}

export function getRound(id) {
  return run('rounds', 'readonly', (s) => s.get(id));
}

export async function listRounds() {
  const all = (await run('rounds', 'readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteRound(id) {
  return run('rounds', 'readwrite', (s) => s.delete(id));
}

export function saveCourse(course) {
  const record = plain({ ...course, updatedAt: Date.now() });
  return run('courses', 'readwrite', (s) => s.put(record)).then(() => record);
}

export async function listCourses() {
  const all = (await run('courses', 'readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteCourse(id) {
  return run('courses', 'readwrite', (s) => s.delete(id));
}

// Tests only: forget the cached connection.
export function _resetForTests() {
  dbPromise = null;
}
