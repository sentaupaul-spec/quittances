// Lecture de la liste des locataires depuis le Google Sheet (format CSV).
import { LOGEMENTS, SHEET_CSV_URL } from "./config.js";
import { lireMontant } from "./montant.js";

/** Découpe un texte CSV (guillemets, virgules et retours à la ligne dans les cellules). */
export function parseCSV(texte) {
  const lignes = [];
  let ligne = [], cell = "", i = 0, guillemets = false;
  texte = String(texte ?? "").replace(/^﻿/, "");
  while (i < texte.length) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { cell += '"'; i += 2; continue; }
        guillemets = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { guillemets = true; i++; continue; }
    if (c === ",") { ligne.push(cell); cell = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { ligne.push(cell); lignes.push(ligne); ligne = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  if (cell !== "" || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes;
}

/** « Civilité » → « civilite », « E-mail » → « email » */
export function normaliser(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

const COLONNES = {
  appt: ["appartement", "logement", "appt", "appart", "code"],
  civ: ["civilite", "civ"],
  nom: ["nom", "nomprenom", "prenomnom", "locataire"],
  loyer: ["loyer"],
  charges: ["charges", "provisionpourcharges", "charge"],
  email: ["email", "mail", "courriel", "adressemail", "adresseemail"],
  actif: ["actif", "active"],
};

/** Clé stable d'un locataire (sert à ranger les archives). */
export function cleLocataire(appt, nom) {
  return appt + "|" + normaliser(nom);
}

function lireCivilite(v) {
  const n = normaliser(v);
  if (["monsieur", "m", "mr", "m."].includes(n)) return "Monsieur";
  return "Madame";
}

/**
 * Transforme le CSV en liste de locataires actifs.
 * Renvoie { locataires: [...], ignorees: [{ ligne, raison }], erreur?: "entete" }
 */
export function lireLocataires(texteCSV) {
  const lignes = parseCSV(texteCSV);
  if (!lignes.length) return { locataires: [], ignorees: [], erreur: "entete" };
  const entete = lignes[0].map(normaliser);
  const idx = {};
  for (const [champ, noms] of Object.entries(COLONNES)) {
    idx[champ] = entete.findIndex((h) => noms.includes(h));
  }
  if (idx.appt < 0 || idx.nom < 0 || idx.loyer < 0) {
    return { locataires: [], ignorees: [], erreur: "entete" };
  }
  const get = (row, champ) => (idx[champ] >= 0 ? String(row[idx[champ]] ?? "").trim() : "");

  const locataires = [], ignorees = [], vus = new Set();
  lignes.slice(1).forEach((row, i) => {
    const numLigne = i + 2;
    if (row.every((c) => String(c).trim() === "")) return; // ligne vide
    const nom = get(row, "nom").replace(/\s+/g, " ");
    const appt = get(row, "appt").toUpperCase().replace(/\s+/g, "");
    const actif = normaliser(get(row, "actif"));
    if (["non", "no", "n", "false", "faux", "0", "inactif"].includes(actif)) return;
    if (!nom) return;
    if (!LOGEMENTS[appt]) {
      ignorees.push({ ligne: numLigne, nom, raison: `logement « ${get(row, "appt") || "vide"} » inconnu` });
      return;
    }
    const loyer = lireMontant(get(row, "loyer"));
    if (loyer === null) {
      ignorees.push({ ligne: numLigne, nom, raison: "loyer illisible" });
      return;
    }
    const charges = lireMontant(get(row, "charges")) ?? 0;
    const cle = cleLocataire(appt, nom);
    if (vus.has(cle)) {
      ignorees.push({ ligne: numLigne, nom, raison: "en double" });
      return;
    }
    vus.add(cle);
    locataires.push({
      cle, appt, nom, loyer, charges,
      civ: lireCivilite(get(row, "civ")),
      email: get(row, "email"),
    });
  });
  const ordre = Object.keys(LOGEMENTS);
  locataires.sort((a, b) => ordre.indexOf(a.appt) - ordre.indexOf(b.appt) || a.nom.localeCompare(b.nom, "fr"));
  return { locataires, ignorees };
}

/**
 * Télécharge le tableau. Lève une erreur avec .type = "reseau" | "acces" | "format".
 */
export async function telechargerLocataires(url = SHEET_CSV_URL, delaiMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), delaiMs);
  let rep;
  try {
    rep = await fetch(url, { cache: "no-store", signal: ctrl.signal, credentials: "omit" });
  } catch (e) {
    throw Object.assign(new Error("reseau"), { type: "reseau" });
  } finally {
    clearTimeout(t);
  }
  if (!rep.ok) throw Object.assign(new Error("acces " + rep.status), { type: "acces" });
  const texte = await rep.text();
  if (/^\s*<(!doctype|html)/i.test(texte)) throw Object.assign(new Error("acces html"), { type: "acces" });
  const res = lireLocataires(texte);
  if (res.erreur) throw Object.assign(new Error("format"), { type: "format" });
  return res;
}
