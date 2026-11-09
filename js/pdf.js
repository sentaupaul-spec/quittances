// Génération du PDF de la quittance (1 page A4), modèle service-public.
// Tout est synchrone : indispensable pour appeler navigator.share() dans le geste de l'utilisateur.
import { MOIS, deMois, SIGNATURE_TAILLE_MM } from "./config.js";
import { montantEnLettres, formatEuros } from "./montant.js";

let signatureDataUrl = null;

/** À appeler une fois au démarrage (et avant toute génération). */
export async function chargerSignature(url) {
  const rep = await fetch(url);
  if (!rep.ok) throw new Error("signature " + rep.status);
  const blob = await rep.blob();
  signatureDataUrl = await new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = ko;
    r.readAsDataURL(blob);
  });
  return signatureDataUrl;
}
export function definirSignature(dataUrl) { signatureDataUrl = dataUrl; }
export function signaturePrete() { return !!signatureDataUrl; }

/** « 2026-11-01 » → « 01/11/2026 » */
export function dateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Retire accents et caractères spéciaux. */
function nettoyerNomFichier(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Quittance_Novembre_2026_Prenom_Nom.pdf */
export function nomFichier(q) {
  return `Quittance_${nettoyerNomFichier(MOIS[q.moisIdx])}_${q.annee}_${nettoyerNomFichier(q.nom)}.pdf`;
}

/** Identifiant de fichier PDF stable (32 caractères hexadécimaux) → PDF régénéré identique. */
function idStable(texte) {
  let out = "";
  for (let graine = 0; graine < 4; graine++) {
    let h = 0x811c9dc5 ^ graine;
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.toUpperCase();
}

/** Construit le document jsPDF à partir d'un instantané complet de quittance. */
export function construirePDF(q) {
  if (!signatureDataUrl) throw new Error("signature non chargée");
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setCreationDate(new Date(q.creeLe));
  doc.setFileId(idStable(q.id + "|" + q.creeLe));
  doc.setDocumentProperties({
    title: `Quittance de loyer — ${MOIS[q.moisIdx]} ${q.annee}`,
    author: q.bailleur.nom,
    subject: `${q.civ} ${q.nom}`,
  });

  const b = q.bailleur, apt = q.logement;
  const total = q.loyer + q.charges;
  const W = 210, ml = 20, mr = 190, cw = mr - ml;

  // En-tête
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(24, 95, 165);
  doc.text("QUITTANCE DE LOYER", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
  doc.text(`Mois ${deMois(q.moisIdx)}${MOIS[q.moisIdx]} ${q.annee}`, W / 2, 25, { align: "center" });
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
  doc.text("Location vide ou meublée à titre de résidence principale", W / 2, 32, { align: "center" });
  doc.setDrawColor(55, 138, 221); doc.setLineWidth(0.7); doc.line(ml, 39, mr, 39);

  // Bailleur / Locataire
  let y = 49;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text("BAILLEUR", ml, y); doc.text("LOCATAIRE", 110, y);
  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
  doc.text(b.nom, ml, y);
  // Nom du locataire : 2 lignes au plus s'il est très long
  const nomLignes = doc.splitTextToSize(`${q.civ} ${q.nom}`, mr - 110).slice(0, 2);
  doc.text(nomLignes, 110, y, { lineHeightFactor: 1.4 });
  const dy = (nomLignes.length - 1) * 5;
  y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
  doc.text(b.societe, ml, y);
  doc.text(b.adresse, ml, y + 4.5);
  doc.text(`${b.cp} ${b.ville}`, ml, y + 9);
  doc.text(apt.adresse, 110, y + dy);
  doc.text(`${apt.cp} ${apt.ville}`, 110, y + dy + 4.5);
  y += 16;
  doc.setTextColor(90, 90, 90);
  doc.text(`Fait à ${q.lieu}, le ${dateFr(q.dateQuittance)}`, mr, y, { align: "right" });
  y += 6;

  // Adresse de la location (sans le code MD)
  doc.setDrawColor(220, 228, 240); doc.setLineWidth(0.3); doc.line(ml, y, mr, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text("ADRESSE DE LA LOCATION", ml, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
  doc.text(`${apt.adresse} — ${apt.cp} ${apt.ville}`, ml, y); y += 9;

  // Texte légal
  doc.setDrawColor(220, 228, 240); doc.line(ml, y, mr, y); y += 7;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
  const legal = `Je soussignée ${b.nom}, propriétaire du logement désigné ci-dessus, déclare avoir reçu de `
    + `${q.civ} ${q.nom} la somme de ${montantEnLettres(total)} (${formatEuros(total)}), au titre du paiement `
    + `du loyer et des charges pour la période de location du ${dateFr(q.debut)} au ${dateFr(q.fin)} `
    + `et lui en donne quittance, sous réserve de tous mes droits.`;
  const lignes = doc.splitTextToSize(legal, cw);
  doc.text(lignes, ml, y);
  y += Math.max(lignes.length, 3) * 5 + 7;

  // Détail du règlement
  doc.setDrawColor(220, 228, 240); doc.line(ml, y, mr, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text("DÉTAIL DU RÈGLEMENT", ml, y); y += 5;
  doc.setFillColor(238, 244, 252); doc.rect(ml, y - 1, cw, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 95, 165);
  doc.text("Désignation", ml + 3, y + 4.5); doc.text("Montant", mr - 3, y + 4.5, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
  doc.text("Loyer", ml + 3, y + 4); doc.text(formatEuros(q.loyer), mr - 3, y + 4, { align: "right" });
  y += 9;
  doc.setDrawColor(235, 238, 245); doc.line(ml, y - 1, mr, y - 1);
  doc.text("Provision pour charges", ml + 3, y + 4); doc.text(formatEuros(q.charges), mr - 3, y + 4, { align: "right" });
  y += 9;
  doc.setDrawColor(55, 138, 221); doc.setLineWidth(0.5);
  doc.setFillColor(238, 244, 252); doc.rect(ml, y, cw, 10, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(24, 95, 165);
  doc.text("TOTAL", ml + 3, y + 6.5); doc.text(formatEuros(total), mr - 3, y + 6.5, { align: "right" });
  doc.rect(ml, y, cw, 10, "S");
  y += 17;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text(`Date du paiement : le ${dateFr(q.datePaiement)}`, ml, y);
  y += 12;

  // Signature
  doc.text("Signature du bailleur :", ml, y);
  y += 3;
  doc.addImage(signatureDataUrl, "PNG", ml, y, SIGNATURE_TAILLE_MM.largeur, SIGNATURE_TAILLE_MM.hauteur,
    "signature", "SLOW");

  // Tampon : ovale à double trait
  const cx = 155, cy = y + 14, rx = 32, ry = 16;
  doc.setDrawColor(30, 30, 30); doc.setLineWidth(1.0); doc.ellipse(cx, cy, rx, ry, "S");
  doc.setLineWidth(0.4); doc.ellipse(cx, cy, rx - 2, ry - 2, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(20, 20, 20);
  doc.text(b.societe, cx, cy - 7, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  doc.text(`${b.adresse} — ${b.cp} ${b.ville}`, cx, cy - 2.5, { align: "center" });
  doc.text(`Siret : ${b.siret}`, cx, cy + 2.5, { align: "center" });
  doc.setFont("helvetica", "italic"); doc.setFontSize(6);
  doc.text(`Signé électroniquement le ${dateFr(q.dateQuittance)}`, cx, cy + 7.5, { align: "center" });

  // Pied de page
  doc.setDrawColor(55, 138, 221); doc.setLineWidth(0.4); doc.line(ml, 272, mr, 272);
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
  const pied = "Cette quittance annule tous les reçus qui auraient pu être établis précédemment en cas de "
    + "paiement partiel du montant du présent terme. Elle est à conserver pendant trois ans par le locataire "
    + "(loi n° 89-462 du 6 juillet 1989 : art. 7-1).";
  doc.text(doc.splitTextToSize(pied, cw), ml, 277);
  return doc;
}

/** PDF prêt à partager : { blob, fichier, nom } */
export function genererFichier(q) {
  const doc = construirePDF(q);
  const blob = doc.output("blob");
  const nom = nomFichier(q);
  const fichier = new File([blob], nom, { type: "application/pdf" });
  return { blob, fichier, nom };
}
