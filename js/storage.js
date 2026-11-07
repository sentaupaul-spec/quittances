// Stockage local de l'appareil (IndexedDB) :
//  - « reglages » : la dernière liste de locataires connue, pour que l'app fonctionne sans internet ;
//  - « envois »   : le suivi des quittances envoyées (qui, quel mois, quel jour). Aucun PDF n'est conservé.

const NOM_BASE = "quittances";
const VERSION = 2;
let basePromise = null;

function ouvrir() {
  if (basePromise) return basePromise;
  basePromise = new Promise((ok, ko) => {
    const req = indexedDB.open(NOM_BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("reglages")) db.createObjectStore("reglages");
      if (!db.objectStoreNames.contains("envois")) db.createObjectStore("envois", { keyPath: "id" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => { basePromise = null; ko(req.error); };
  });
  return basePromise;
}

async function tx(magasin, mode, action) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(magasin, mode);
    let resultat;
    const req = action(t.objectStore(magasin));
    if (req) req.onsuccess = () => { resultat = req.result; };
    t.oncomplete = () => ok(resultat);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

export const reglages = {
  lire: (cle) => tx("reglages", "readonly", (s) => s.get(cle)),
  ecrire: (cle, valeur) => tx("reglages", "readwrite", (s) => s.put(valeur, cle)),
};

/** Suivi des envois. Un enregistrement par locataire et par mois : { id: "clé|2026-11", ... }. */
export const envois = {
  tous: () => tx("envois", "readonly", (s) => s.getAll()),
  noter: (envoi) => tx("envois", "readwrite", (s) => s.put(envoi)),
  oublier: (id) => tx("envois", "readwrite", (s) => s.delete(id)),
};

/** Demande au navigateur de ne pas effacer les données de l'app. */
export async function demanderPersistance() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* sans importance */ }
  return false;
}
