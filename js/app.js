// Interface de l'application.
import { BAILLEUR, LOGEMENTS, MOIS, LIEU_PAR_DEFAUT, SIGNATURE_URL, APP_VERSION } from "./config.js";
import { formatEuros, formatSaisie, lireMontant } from "./montant.js";
import { telechargerLocataires } from "./sheet.js";
import { chargerSignature, genererFichier, dateFr } from "./pdf.js";
import { archives, reglages, idArchive, demanderPersistance, exporterSauvegarde, importerSauvegarde } from "./storage.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nomLogement = (k) => `${k} — ${LOGEMENTS[k].adresse}`;

const etat = {
  locataires: [],
  ignorees: [],
  majLe: null,        // date de la dernière liste reçue du tableau
  horsLigne: false,
  enCours: true,      // première vérification de la liste en cours
  choisi: null,       // clé du locataire choisi
  archives: [],
};

/* ---------------------------------------------------------------- Messages */
function message(id, type, texte) {
  const el = $(id);
  el.className = "message " + (type || "");
  el.textContent = texte || "";
}
function effacerMessage(id) { message(id, "", ""); }

let resoudreFenetre = null;
function confirmer(texte, oui = "Oui", non = "Annuler") {
  $("fenetre-texte").textContent = texte;
  $("fenetre-oui").textContent = oui;
  $("fenetre-non").textContent = non;
  $("voile").hidden = false;
  return new Promise((ok) => { resoudreFenetre = ok; });
}
function fermerFenetre(reponse) {
  $("voile").hidden = true;
  if (resoudreFenetre) { resoudreFenetre(reponse); resoudreFenetre = null; }
}
$("fenetre-oui").onclick = () => fermerFenetre(true);
$("fenetre-non").onclick = () => fermerFenetre(false);

/* ---------------------------------------------------------------- Onglets */
function afficherOnglet(nom) {
  document.querySelectorAll(".onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.querySelectorAll("main > section").forEach((s) => s.classList.toggle("actif", s.id === "onglet-" + nom));
  if (nom === "archives") afficherArchives();
  if (nom === "locataires") afficherLocataires();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".onglet").forEach((b) => { b.onclick = () => afficherOnglet(b.dataset.onglet); });

/* ---------------------------------------------------------------- Liste des locataires */
function texteEtatListe() {
  if (etat.enCours && etat.majLe) return "Vérification de la liste des locataires…";
  if (!etat.majLe) return "";
  const d = new Date(etat.majLe);
  const quand = `${dateFr(iso(d))} à ${pad(d.getHours())} h ${pad(d.getMinutes())}`;
  return etat.horsLigne
    ? `Pas de connexion internet : liste du ${quand}.`
    : `Liste mise à jour le ${quand}.`;
}

function afficherEtatListe() {
  const t = texteEtatListe();
  for (const id of ["etat-liste", "etat-liste-2"]) {
    const el = $(id);
    el.textContent = t;
    el.hidden = !t;
    el.classList.toggle("hors-ligne", etat.horsLigne);
  }
  const note = $("note-paul");
  if (etat.ignorees.length) {
    note.hidden = false;
    note.textContent = "Note pour Paul — lignes du tableau non prises en compte : "
      + etat.ignorees.map((x) => `ligne ${x.ligne} (${x.nom} : ${x.raison})`).join(" ; ") + ".";
  } else note.hidden = true;
}

const MSG_ERREUR = {
  reseau: "Impossible de charger la liste des locataires. Vérifiez que le wifi est allumé, puis appuyez sur « Réessayer ».",
  acces: "La liste des locataires n'est pas accessible pour le moment. Prévenez Paul.",
  format: "La liste des locataires n'a pas pu être lue. Prévenez Paul.",
};

async function chargerListe({ manuel = false } = {}) {
  try {
    etat.enCours = true;
    const res = await telechargerLocataires();
    etat.locataires = res.locataires;
    etat.ignorees = res.ignorees;
    etat.majLe = new Date().toISOString();
    etat.horsLigne = false;
    etat.enCours = false;
    await reglages.ecrire("liste", { locataires: res.locataires, ignorees: res.ignorees, majLe: etat.majLe }).catch(() => {});
    afficherTout();
    if (manuel) message("message-locataires", "ok", "La liste est à jour.");
    return true;
  } catch (e) {
    const type = e.type || "reseau";
    etat.horsLigne = true;
    etat.enCours = false;
    if (etat.locataires.length) {
      afficherTout();
      if (manuel) message("message-locataires", "erreur", MSG_ERREUR[type].replace("« Réessayer »", "« Actualiser la liste »"));
    } else {
      $("chargement").hidden = true;
      $("formulaire").hidden = true;
      $("sans-liste").hidden = false;
      $("sans-liste-texte").textContent = MSG_ERREUR[type];
      if (manuel) message("message-locataires", "erreur", MSG_ERREUR[type].replace("« Réessayer »", "« Actualiser la liste »"));
    }
    return false;
  }
}

function afficherTout() {
  $("chargement").hidden = true;
  $("sans-liste").hidden = true;
  afficherEtatListe();
  if (!etat.locataires.length) {
    $("formulaire").hidden = true;
    $("sans-liste").hidden = false;
    $("sans-liste-texte").textContent = "Aucun locataire dans la liste pour le moment. Prévenez Paul.";
  } else {
    $("formulaire").hidden = false;
  }
  if (etat.choisi && !etat.locataires.some((l) => l.cle === etat.choisi)) etat.choisi = null;
  afficherChoix();
  afficherLocataires();
  afficherTous();
}

/* ---------------------------------------------------------------- Onglet Créer */
function afficherChoix() {
  const html = Object.keys(LOGEMENTS).map((k) => {
    const liste = etat.locataires.filter((l) => l.appt === k);
    if (!liste.length) return "";
    return `<div class="groupe" data-k="${k}">
      <div class="groupe-titre"><span class="tag" data-k="${k}">${k}</span>${esc(LOGEMENTS[k].adresse)}</div>
      <div class="choix">${liste.map((l) => `
        <button class="choix-btn${l.cle === etat.choisi ? " choisi" : ""}" data-cle="${esc(l.cle)}" aria-pressed="${l.cle === etat.choisi}">
          <span class="coche">${l.cle === etat.choisi ? "✓" : ""}</span>${esc(l.civ)} ${esc(l.nom)}
        </button>`).join("")}
      </div></div>`;
  }).join("");
  $("choix-locataires").innerHTML = html;
  $("choix-locataires").querySelectorAll(".choix-btn").forEach((b) => {
    b.onclick = () => choisirLocataire(b.dataset.cle, true);
  });
  const ok = !!locataireChoisi();
  $("verif").hidden = !ok; $("envoi").hidden = !ok;
  $("attente-3").hidden = ok; $("attente-4").hidden = ok;
}

function locataireChoisi() { return etat.locataires.find((l) => l.cle === etat.choisi) || null; }

function choisirLocataire(cle, defiler) {
  etat.choisi = cle;
  afficherChoix();
  remplirFormulaire();
  if (defiler) $("etape-2").scrollIntoView({ behavior: "smooth", block: "start" });
}

function initMois() {
  const now = new Date();
  $("c-mois").innerHTML = MOIS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  const y = now.getFullYear();
  $("c-annee").innerHTML = [y - 2, y - 1, y, y + 1].map((v) => `<option value="${v}">${v}</option>`).join("");
  $("c-mois").value = String(now.getMonth());
  $("c-annee").value = String(y);
}
const moisChoisi = () => ({ moisIdx: +$("c-mois").value, annee: +$("c-annee").value });

function remplirFormulaire() {
  const l = locataireChoisi();
  if (!l) return;
  const { moisIdx, annee } = moisChoisi();
  $("resume").innerHTML = `<strong>${esc(l.civ)} ${esc(l.nom)}</strong> — ${esc(MOIS[moisIdx])} ${annee}`;
  $("c-loyer").value = formatSaisie(l.loyer);
  $("c-charges").value = formatSaisie(l.charges);
  $("c-datepaiement").value = iso(new Date(annee, moisIdx, 1));
  $("c-civ").value = l.civ;
  $("c-nom").value = l.nom;
  $("c-debut").value = iso(new Date(annee, moisIdx, 1));
  $("c-fin").value = iso(new Date(annee, moisIdx + 1, 0));
  $("c-lieu").value = LIEU_PAR_DEFAUT;
  $("c-datequittance").value = iso(new Date());
  $("aide-mail").innerHTML = l.email
    ? `Adresse e-mail de ${esc(l.civ)} ${esc(l.nom)} :<br><strong>${esc(l.email)}</strong>`
    : `Pas d'adresse e-mail enregistrée pour ${esc(l.civ)} ${esc(l.nom)}.`;
  document.querySelectorAll("#verif input").forEach((i) => i.classList.remove("invalide"));
  effacerMessage("message-creer");
  majTotal();
}

function majTotal() {
  const loyer = lireMontant($("c-loyer").value), charges = lireMontant($("c-charges").value || "0");
  $("c-total").textContent = loyer === null || charges === null ? "—" : formatEuros(loyer + charges);
}
$("c-mois").onchange = $("c-annee").onchange = () => { remplirFormulaire(); afficherTous(); };
$("c-loyer").oninput = $("c-charges").oninput = majTotal;

/** Instantané complet de la quittance (tout ce qu'il faut pour régénérer le PDF à l'identique). */
function instantane(l, champs) {
  return {
    version: 1,
    id: idArchive(l.cle, champs.annee, champs.moisIdx),
    cle: l.cle,
    appt: l.appt,
    email: l.email || "",
    civ: champs.civ,
    nom: champs.nom,
    moisIdx: champs.moisIdx,
    annee: champs.annee,
    loyer: champs.loyer,
    charges: champs.charges,
    datePaiement: champs.datePaiement,
    debut: champs.debut,
    fin: champs.fin,
    lieu: champs.lieu,
    dateQuittance: champs.dateQuittance,
    bailleur: { ...BAILLEUR },
    logement: { adresse: LOGEMENTS[l.appt].adresse, cp: LOGEMENTS[l.appt].cp, ville: LOGEMENTS[l.appt].ville },
    creeLe: new Date().toISOString(),
  };
}

/** Lit et vérifie le formulaire. Renvoie la quittance, ou null (avec un message clair). */
function lireFormulaire() {
  const l = locataireChoisi();
  if (!l) { message("message-creer", "erreur", "Choisissez d'abord un locataire (étape 1)."); return null; }
  document.querySelectorAll("#verif input").forEach((i) => i.classList.remove("invalide"));
  const erreur = (id, texte) => {
    $(id).classList.add("invalide");
    if (["c-debut", "c-fin", "c-lieu", "c-datequittance", "c-nom"].includes(id)) $("plus").open = true;
    message("message-creer", "erreur", texte);
    return null;
  };
  const { moisIdx, annee } = moisChoisi();
  const loyer = lireMontant($("c-loyer").value);
  if (loyer === null || loyer < 0) return erreur("c-loyer", "Le loyer n'est pas lisible. Tapez seulement des chiffres, par exemple 520 ou 520,50.");
  const charges = lireMontant($("c-charges").value || "0");
  if (charges === null || charges < 0) return erreur("c-charges", "Les charges ne sont pas lisibles. Tapez seulement des chiffres, par exemple 80 (ou 0 s'il n'y en a pas).");
  if (loyer + charges <= 0) return erreur("c-loyer", "Le total est à 0 €. Vérifiez le loyer.");
  const datePaiement = $("c-datepaiement").value;
  if (!datePaiement) return erreur("c-datepaiement", "Indiquez la date du paiement.");
  const nom = $("c-nom").value.trim().replace(/\s+/g, " ");
  if (!nom) return erreur("c-nom", "Indiquez le nom du locataire (dans « Autres informations »).");
  const debut = $("c-debut").value, fin = $("c-fin").value;
  if (!debut || !fin || debut > fin) return erreur("c-debut", "Vérifiez la période (dans « Autres informations ») : la date de début doit être avant la date de fin.");
  const dateQuittance = $("c-datequittance").value;
  if (!dateQuittance) return erreur("c-datequittance", "Indiquez la date de la quittance (dans « Autres informations »).");
  return instantane(l, {
    moisIdx, annee, loyer, charges, datePaiement, debut, fin, nom, dateQuittance,
    civ: $("c-civ").value,
    lieu: $("c-lieu").value.trim() || LIEU_PAR_DEFAUT,
  });
}

/* ---------------------------------------------------------------- Envoi / téléchargement */
const peutPartager = (fichier) => {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })); }
  catch (e) { return false; }
};

function texteMail(q) {
  return `Bonjour ${q.civ} ${q.nom},\n\nVeuillez trouver ci-joint votre quittance de loyer pour le mois de `
    + `${MOIS[q.moisIdx].toLowerCase()} ${q.annee}.\n\nBien cordialement,\n${q.bailleur.nom}`;
}
const titreMail = (q) => `Quittance de loyer — ${MOIS[q.moisIdx]} ${q.annee}`;

function telechargerBlob(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nom; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Envoie (menu Partager → Mail) ou télécharge une quittance.
 * ⚠️ Doit être appelée DIRECTEMENT depuis le geste (clic) : aucune attente avant navigator.share().
 * Renvoie une promesse : "partage" | "annule" | "telecharge" | "echec".
 */
function livrer(q, action) {
  const { blob, fichier, nom } = genererFichier(q); // synchrone
  if (action === "envoyer" && peutPartager(fichier)) {
    return navigator.share({ files: [fichier], title: titreMail(q), text: texteMail(q) })
      .then(() => "partage")
      .catch((e) => (e && e.name === "AbortError" ? "annule" : "echec"));
  }
  telechargerBlob(blob, nom);
  if (action === "envoyer") {
    // Ordinateur sans menu Partager : on ouvre aussi la messagerie.
    const mailto = `mailto:${encodeURIComponent(q.email || "")}?subject=${encodeURIComponent(titreMail(q))}`
      + `&body=${encodeURIComponent(texteMail(q) + `\n\n(Pièce jointe : ${nom})`)}`;
    setTimeout(() => { window.location.href = mailto; }, 400);
  }
  return Promise.resolve("telecharge");
}

const MSG_LIVRAISON = {
  envoyer: {
    partage: "C'est fait. La quittance est aussi rangée dans les Archives.",
    annule: "Envoi annulé. La quittance est quand même rangée dans les Archives. Appuyez à nouveau sur « Envoyer par mail » pour recommencer.",
    echec: "L'envoi n'a pas pu s'ouvrir. Appuyez à nouveau sur « Envoyer par mail ». La quittance est rangée dans les Archives.",
    telecharge: "Le PDF est téléchargé et votre messagerie s'ouvre : joignez le fichier au message. La quittance est rangée dans les Archives.",
  },
  telecharger: {
    telecharge: "PDF téléchargé. La quittance est aussi rangée dans les Archives.",
  },
};

function creer(action) {
  const q = lireFormulaire();
  if (!q) return;
  let promesse;
  try {
    promesse = livrer(q, action); // d'abord, dans le geste
  } catch (e) {
    message("message-creer", "erreur", "La quittance n'a pas pu être préparée. Fermez l'application et rouvrez-la, puis recommencez. Si cela continue, prévenez Paul.");
    console.error(e);
    return;
  }
  const archivage = archives.enregistrer(q).then(() => true).catch((e) => { console.error(e); return false; });
  message("message-creer", "info", action === "envoyer" ? "Ouverture de l'envoi…" : "Préparation du PDF…");
  Promise.all([promesse, archivage]).then(([r, archive]) => {
    let texte = MSG_LIVRAISON[action][r] || MSG_LIVRAISON[action].telecharge;
    if (!archive) texte = texte.replace(/ ?La quittance (est|est aussi|est quand même) rangée dans les Archives\./, "")
      + " Attention : elle n'a pas pu être rangée dans les Archives.";
    message("message-creer", r === "echec" || !archive ? "erreur" : r === "annule" ? "info" : "ok", texte);
    rafraichirArchives();
  });
}
$("btn-envoyer").onclick = () => creer("envoyer");
$("btn-telecharger").onclick = () => creer("telecharger");

/* ---------------------------------------------------------------- Tous les locataires du mois */
function afficherTous() {
  const { moisIdx, annee } = moisChoisi();
  $("tous-intro").innerHTML = `Pour <strong>${MOIS[moisIdx]} ${annee}</strong> (le mois choisi à l'étape 2), avec les montants de la liste `
    + `et un paiement le 1er du mois. Appuyez sur « Envoyer » pour chaque locataire, l'un après l'autre.`;
  const faits = new Map(etat.archives.map((q) => [q.id, q]));
  $("tous-liste").innerHTML = etat.locataires.map((l) => {
    const id = idArchive(l.cle, annee, moisIdx);
    const deja = faits.get(id);
    return `<div class="tous-ligne">
      <div><span class="tag" data-k="${l.appt}">${l.appt}</span> <span class="qui">${esc(l.civ)} ${esc(l.nom)}</span>
        <span class="combien">${formatEuros(l.loyer + l.charges)}</span>
        ${deja ? `<span class="fait">✓ Quittance faite le ${dateFr(deja.creeLe.slice(0, 10))}</span>` : ""}</div>
      <button class="btn ${deja ? "btn-secondaire" : "btn-principal"} btn-petit" data-cle="${esc(l.cle)}">${deja ? "Renvoyer" : "Envoyer"}</button>
    </div>`;
  }).join("");
  $("tous-liste").querySelectorAll("button[data-cle]").forEach((b) => { b.onclick = () => envoyerUn(b.dataset.cle); });
}

function envoyerUn(cle) {
  const l = etat.locataires.find((x) => x.cle === cle);
  if (!l) return;
  const { moisIdx, annee } = moisChoisi();
  const q = instantane(l, {
    moisIdx, annee, loyer: l.loyer, charges: l.charges, civ: l.civ, nom: l.nom, lieu: LIEU_PAR_DEFAUT,
    datePaiement: iso(new Date(annee, moisIdx, 1)),
    debut: iso(new Date(annee, moisIdx, 1)),
    fin: iso(new Date(annee, moisIdx + 1, 0)),
    dateQuittance: iso(new Date()),
  });
  let promesse;
  try { promesse = livrer(q, "envoyer"); } catch (e) {
    message("message-tous", "erreur", "La quittance n'a pas pu être préparée. Fermez l'application et rouvrez-la. Si cela continue, prévenez Paul.");
    return;
  }
  const archivage = archives.enregistrer(q).then(() => true).catch(() => false);
  Promise.all([promesse, archivage]).then(([r, archive]) => {
    const qui = `${l.civ} ${l.nom}`;
    if (r === "annule") message("message-tous", "info", `Envoi à ${qui} annulé. Vous pouvez recommencer.`);
    else if (r === "echec") message("message-tous", "erreur", `L'envoi à ${qui} n'a pas pu s'ouvrir. Appuyez à nouveau sur « Envoyer ».`);
    else message("message-tous", archive ? "ok" : "erreur", `Quittance de ${qui} : c'est fait.` + (archive ? " Elle est rangée dans les Archives." : " Attention : elle n'a pas pu être rangée dans les Archives."));
    rafraichirArchives();
  });
}

/* ---------------------------------------------------------------- Onglet Locataires */
function afficherLocataires() {
  $("liste-locataires").innerHTML = Object.keys(LOGEMENTS).map((k) => {
    const lg = LOGEMENTS[k];
    const liste = etat.locataires.filter((l) => l.appt === k);
    const lignes = liste.length ? liste.map((l) => `
      <div class="locataire">
        <div class="locataire-nom">${esc(l.civ)} ${esc(l.nom)}</div>
        <div class="locataire-detail">Loyer ${formatEuros(l.loyer)} + charges ${formatEuros(l.charges)} = <strong>${formatEuros(l.loyer + l.charges)}</strong></div>
        <div class="locataire-detail">${l.email ? "E-mail : " + esc(l.email) : "Pas d'adresse e-mail"}</div>
      </div>`).join("") : `<div class="vide">Aucun locataire dans ce logement.</div>`;
    return `<div class="carte logement" data-k="${k}">
      <div class="logement-tete"><span class="tag" data-k="${k}">${k}</span><span class="logement-adresse">${esc(lg.adresse)}</span></div>
      <div class="logement-ville">${esc(lg.cp)} ${esc(lg.ville)}</div>
      ${lignes}
    </div>`;
  }).join("");
}

$("btn-actualiser").onclick = async () => {
  const b = $("btn-actualiser");
  b.disabled = true; b.textContent = "Mise à jour…";
  effacerMessage("message-locataires");
  await chargerListe({ manuel: true });
  b.disabled = false; b.textContent = "Actualiser la liste";
};
$("btn-reessayer").onclick = async () => {
  $("btn-reessayer").disabled = true;
  await chargerListe();
  $("btn-reessayer").disabled = false;
};

/* ---------------------------------------------------------------- Onglet Archives */
async function rafraichirArchives() {
  try { etat.archives = await archives.toutes(); } catch (e) { etat.archives = []; }
  afficherTous();
  if ($("onglet-archives").classList.contains("actif")) afficherArchives();
}

const ouverts = new Set();
function afficherArchives() {
  const liste = etat.archives;
  if (!liste.length) {
    $("liste-archives").innerHTML = `<div class="carte"><p class="vide">Aucune quittance pour l'instant. Elles apparaîtront ici dès la première création.</p></div>`;
    return;
  }
  const actifs = new Set(etat.locataires.map((l) => l.cle));
  const codes = [...new Set([...Object.keys(LOGEMENTS), ...liste.map((q) => q.appt)])];
  $("liste-archives").innerHTML = codes.map((k) => {
    const items = liste.filter((q) => q.appt === k);
    if (!items.length) return "";
    const groupes = new Map();
    items.forEach((q) => { if (!groupes.has(q.cle)) groupes.set(q.cle, []); groupes.get(q.cle).push(q); });
    const blocs = [...groupes.entries()].map(([cle, qs]) => {
      qs.sort((a, b) => (b.annee * 12 + b.moisIdx) - (a.annee * 12 + a.moisIdx));
      return { cle, qs, nom: `${qs[0].civ} ${qs[0].nom}` };
    }).sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map(({ cle, qs, nom }) => `
      <details class="arch-locataire" data-cle="${esc(cle)}"${ouverts.has(cle) ? " open" : ""}>
        <summary><span class="nom">${esc(nom)}</span>
          ${actifs.has(cle) || etat.horsLigne ? "" : `<span class="ancien">ancien locataire</span>`}
          <span class="compte">${qs.length} quittance${qs.length > 1 ? "s" : ""}</span></summary>
        ${qs.map((q) => `
          <div class="arch-ligne">
            <div class="arch-mois">${MOIS[q.moisIdx]} ${q.annee}</div>
            <div class="arch-detail">${formatEuros(q.loyer + q.charges)} · payé le ${dateFr(q.datePaiement)} · faite le ${dateFr(q.dateQuittance)}</div>
            <div class="arch-btns">
              <button class="btn btn-secondaire" data-action="telecharger" data-id="${esc(q.id)}">Télécharger</button>
              <button class="btn btn-secondaire" data-action="envoyer" data-id="${esc(q.id)}">Envoyer</button>
              <button class="btn btn-danger" data-action="supprimer" data-id="${esc(q.id)}">Supprimer</button>
            </div>
          </div>`).join("")}
      </details>`).join("");
    const lg = LOGEMENTS[k];
    return `<div class="carte logement" data-k="${esc(k)}">
      <div class="logement-tete"><span class="tag" data-k="${esc(k)}">${esc(k)}</span><span class="logement-adresse">${esc(lg ? lg.adresse : items[0].logement.adresse)}</span></div>
      ${blocs}
    </div>`;
  }).join("");
  $("liste-archives").querySelectorAll("details.arch-locataire").forEach((d) => {
    d.ontoggle = () => { if (d.open) ouverts.add(d.dataset.cle); else ouverts.delete(d.dataset.cle); };
  });
  $("liste-archives").querySelectorAll("button[data-action]").forEach((b) => {
    b.onclick = () => actionArchive(b.dataset.action, b.dataset.id);
  });
}

function actionArchive(action, id) {
  const q = etat.archives.find((x) => x.id === id);
  if (!q) return;
  const quoi = `${MOIS[q.moisIdx]} ${q.annee} de ${q.civ} ${q.nom}`;
  if (action === "supprimer") {
    confirmer(`Supprimer la quittance de ${quoi} ?\n\nElle sera effacée des Archives.`, "Oui, supprimer", "Non, garder").then(async (oui) => {
      if (!oui) return;
      try {
        await archives.supprimer(id);
        message("message-archives", "ok", `La quittance de ${quoi} est supprimée.`);
      } catch (e) {
        message("message-archives", "erreur", "La quittance n'a pas pu être supprimée. Fermez l'application, rouvrez-la et recommencez.");
      }
      await rafraichirArchives();
      afficherArchives();
    });
    return;
  }
  let promesse;
  try { promesse = livrer(q, action); } catch (e) {
    message("message-archives", "erreur", "Le PDF n'a pas pu être préparé. Fermez l'application et rouvrez-la. Si cela continue, prévenez Paul.");
    return;
  }
  promesse.then((r) => {
    const t = {
      partage: `Quittance de ${quoi} : c'est fait.`,
      annule: "Envoi annulé.",
      echec: "L'envoi n'a pas pu s'ouvrir. Appuyez à nouveau sur « Envoyer ».",
      telecharge: action === "envoyer"
        ? "Le PDF est téléchargé et votre messagerie s'ouvre : joignez le fichier au message."
        : `PDF de ${quoi} téléchargé.`,
    }[r];
    message("message-archives", r === "echec" ? "erreur" : r === "annule" ? "info" : "ok", t);
  });
}

/* ---------------------------------------------------------------- Sauvegarde */
$("btn-sauvegarder").onclick = async () => {
  try {
    const donnees = await exporterSauvegarde();
    const nom = `Sauvegarde_quittances_${iso(new Date())}.json`;
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
    const fichier = new File([blob], nom, { type: "application/json" });
    // Sur iPad : menu Partager → « Enregistrer dans Fichiers » (iCloud Drive).
    if (peutPartager(fichier)) {
      try {
        await navigator.share({ files: [fichier], title: "Sauvegarde des quittances" });
        message("message-sauvegarde", "ok", `Sauvegarde enregistrée (${donnees.quittances.length} quittance${donnees.quittances.length > 1 ? "s" : ""}).`);
      } catch (e) {
        if (e && e.name === "AbortError") message("message-sauvegarde", "info", "Sauvegarde annulée.");
        else { telechargerBlob(blob, nom); message("message-sauvegarde", "ok", "Sauvegarde téléchargée."); }
      }
    } else {
      telechargerBlob(blob, nom);
      message("message-sauvegarde", "ok", `Sauvegarde téléchargée (${donnees.quittances.length} quittance${donnees.quittances.length > 1 ? "s" : ""}).`);
    }
  } catch (e) {
    message("message-sauvegarde", "erreur", "La sauvegarde n'a pas pu être faite. Prévenez Paul.");
  }
};
$("btn-restaurer").onclick = () => $("fichier-restaurer").click();
$("fichier-restaurer").onchange = async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  let objet;
  try { objet = JSON.parse(await f.text()); } catch (e) { objet = null; }
  if (!objet || !Array.isArray(objet.quittances) || objet.application !== "quittances-sci-cbi") {
    message("message-sauvegarde", "erreur", "Ce fichier n'est pas une sauvegarde des quittances. Choisissez un fichier qui commence par « Sauvegarde_quittances ».");
    return;
  }
  const n = objet.quittances.length;
  const oui = await confirmer(`Ajouter les ${n} quittance${n > 1 ? "s" : ""} de cette sauvegarde aux Archives ?\n\nLes quittances déjà présentes sont conservées.`, "Oui, restaurer", "Annuler");
  if (!oui) return;
  try {
    const nb = await importerSauvegarde(objet);
    await rafraichirArchives();
    afficherArchives();
    message("message-sauvegarde", "ok", `Sauvegarde restaurée : ${nb} quittance${nb > 1 ? "s" : ""}.`);
  } catch (e) {
    message("message-sauvegarde", "erreur", "La sauvegarde n'a pas pu être restaurée. Prévenez Paul.");
  }
};

/* ---------------------------------------------------------------- Mode écran d'accueil */
function estAppareilApple() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function estStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}
if (estAppareilApple() && !estStandalone()) $("bandeau-safari").hidden = false;

/* ---------------------------------------------------------------- Mises à jour de l'app */
function enregistrerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}
// L'iPad garde souvent l'app « endormie » en mémoire. Si elle revient après plus d'une heure,
// on recharge : nouvelle version de l'app et liste des locataires à jour.
let cacheeDepuis = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cacheeDepuis = Date.now(); return; }
  if (cacheeDepuis && Date.now() - cacheeDepuis > 60 * 60 * 1000 && $("voile").hidden) location.reload();
});

/* ---------------------------------------------------------------- Démarrage */
async function demarrer() {
  $("version").textContent = `Version ${APP_VERSION}`;
  initMois();
  enregistrerServiceWorker();
  demanderPersistance();

  try { await chargerSignature(SIGNATURE_URL); }
  catch (e) { console.error(e); }

  // 1) dernière liste connue (affichage immédiat, même sans réseau)
  try {
    const cache = await reglages.lire("liste");
    if (cache && Array.isArray(cache.locataires)) {
      etat.locataires = cache.locataires;
      etat.ignorees = cache.ignorees || [];
      etat.majLe = cache.majLe;
      afficherTout();
    }
  } catch (e) { /* pas de liste enregistrée */ }
  await rafraichirArchives();
  // 2) liste à jour depuis le tableau
  await chargerListe();
  document.body.dataset.pret = "1";
}

window.__quittances = { etat, livrer, genererFichier }; // pour les tests
demarrer();
