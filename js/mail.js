// Texte du mail qui accompagne la quittance. Modifier ici pour changer la formulation.
import { MOIS } from "./config.js";

/** Objet du mail. */
export function titreMail(q) {
  return `Quittance de loyer — ${MOIS[q.moisIdx]} ${q.annee}`;
}

/** Corps du mail. */
export function texteMail(q) {
  return `Bonjour ${q.nom},\n\n`
    + `Voici votre quittance de loyer du mois de ${MOIS[q.moisIdx].toLowerCase()} ${q.annee}.\n\n`
    + `Je vous en souhaite bonne réception.\n\n`
    + `Cordialement,\n${q.bailleur.nom}`;
}
