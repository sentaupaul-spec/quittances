// Stockage local de l'appareil (IndexedDB) : seulement la dernière liste de locataires connue,
// pour que l'app fonctionne sans internet. Aucune quittance n'est conservée.

const NOM_BASE = "quittances";
const VERSION = 1;
let basePromise = null;

function ouvrir() {
  if (basePromise) return basePromise;
  basePromise = new Promise((ok, ko) => {
    const req = indexedDB.open(NOM_BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("reglages")) db.createObjectStore("reglages");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => { basePromise = null; ko(req.error); };
  });
  return basePromise;
}

async function tx(mode, action) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction("reglages", mode);
    let resultat;
    const req = action(t.objectStore("reglages"));
    if (req) req.onsuccess = () => { resultat = req.result; };
    t.oncomplete = () => ok(resultat);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

export const reglages = {
  lire: (cle) => tx("readonly", (s) => s.get(cle)),
  ecrire: (cle, valeur) => tx("readwrite", (s) => s.put(valeur, cle)),
};

/** Demande au navigateur de ne pas effacer les données de l'app. */
export async function demanderPersistance() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* sans importance */ }
  return false;
}
