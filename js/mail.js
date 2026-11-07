// Texte du mail qui accompagne la quittance. Modifier ici pour changer la formulation.
import { MOIS } from "./config.js";

/**
 * Nom de famille à partir de « Prénom Nom » : on retire le premier mot (le prénom).
 * « Paul Sentaurens » → « Sentaurens » ; « Jean-Baptiste Le Goff » → « Le Goff » ; « Martin » → « Martin ».
 */
export function nomDeFamille(nomComplet) {
  const mots = String(nomComplet ?? "").trim().split(/\s+/).filter(Boolean);
  return mots.length > 1 ? mots.slice(1).join(" ") : mots.join("");
}

/** Objet du mail. */
export function titreMail(q) {
  return `Quittance de loyer — ${MOIS[q.moisIdx]} ${q.annee}`;
}

/** Corps du mail. */
export function texteMail(q) {
  return `Bonjour ${q.civ} ${nomDeFamille(q.nom)},\n\n`
    + `Voici votre quittance de loyer du mois de ${MOIS[q.moisIdx].toLowerCase()} ${q.annee}.\n\n`
    + `Je vous en souhaite bonne réception.\n\n`
    + `Cordialement,\n${q.bailleur.nom}`;
}
