// Stockage local de l'appareil (IndexedDB) : archives des quittances + dernière liste de locataires connue.
// On ne stocke que des DONNÉES : le PDF est régénéré à l'identique à la demande.

const NOM_BASE = "quittances";
const VERSION = 1;
let basePromise = null;

function ouvrir() {
  if (basePromise) return basePromise;
  basePromise = new Promise((ok, ko) => {
    const req = indexedDB.open(NOM_BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("archives")) db.createObjectStore("archives", { keyPath: "id" });
      if (!db.objectStoreNames.contains("reglages")) db.createObjectStore("reglages");
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
    const store = t.objectStore(magasin);
    let resultat;
    const req = action(store);
    if (req) req.onsuccess = () => { resultat = req.result; };
    t.oncomplete = () => ok(resultat);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

/** Identifiant d'archive : même locataire + même mois → même id → remplace la précédente. */
export function idArchive(cleLocataire, annee, moisIdx) {
  return `${cleLocataire}|${annee}-${String(moisIdx + 1).padStart(2, "0")}`;
}

export const archives = {
  enregistrer: (q) => tx("archives", "readwrite", (s) => s.put(q)),
  toutes: () => tx("archives", "readonly", (s) => s.getAll()).then((l) => l || []),
  lire: (id) => tx("archives", "readonly", (s) => s.get(id)),
  supprimer: (id) => tx("archives", "readwrite", (s) => s.delete(id)),
};

export const reglages = {
  lire: (cle) => tx("reglages", "readonly", (s) => s.get(cle)),
  ecrire: (cle, valeur) => tx("reglages", "readwrite", (s) => s.put(valeur, cle)),
};

/** Demande au navigateur de ne pas effacer les données de l'app. */
export async function demanderPersistance() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* sans importance */ }
  return false;
}

/** Sauvegarde complète (format JSON). */
export async function exporterSauvegarde() {
  return {
    application: "quittances-sci-cbi",
    version: 1,
    exporteLe: new Date().toISOString(),
    quittances: await archives.toutes(),
  };
}

/** Restaure en AJOUTANT aux archives existantes (une quittance de même id est remplacée). Renvoie le nombre importé. */
export async function importerSauvegarde(objet) {
  if (!objet || objet.application !== "quittances-sci-cbi" || !Array.isArray(objet.quittances)) {
    throw new Error("sauvegarde invalide");
  }
  const valides = objet.quittances.filter((q) => q && q.id && q.nom && q.logement && q.bailleur
    && Number.isInteger(q.moisIdx) && Number.isInteger(q.annee));
  const db = await ouvrir();
  await new Promise((ok, ko) => {
    const t = db.transaction("archives", "readwrite");
    const s = t.objectStore("archives");
    valides.forEach((q) => s.put(q));
    t.oncomplete = ok;
    t.onerror = () => ko(t.error);
  });
  return valides.length;
}
