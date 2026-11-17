// studio/roomFiles.js — a photo picked with 📎 but not sent yet, kept in this browser (13 Nov 2026), so a reload or
// an accidental exit doesn't lose it. A phone photo is several MB — too big for localStorage — so it goes in the
// browser's IndexedDB (no library). Every call answers null when that isn't possible (a private window, blocked
// storage): the photo is then simply not kept, as before.
const DB = "identee-room";
const STORE = "files";

let opening = null;
const open = () => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!opening) {
    opening = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return opening;
};

const run = async (mode, work) => {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

// value: { chatId, buf (an ArrayBuffer — old Safari loses Blobs kept like this), type, name, w, h }
export const keepFile = (key, value) => run("readwrite", (s) => s.put(value, key));
export const keptFile = (key) => run("readonly", (s) => s.get(key));
export const dropFile = (key) => run("readwrite", (s) => s.delete(key));
// signing out: nothing of the last person's is left for the next one
export const dropAllFiles = () => run("readwrite", (s) => s.clear());
