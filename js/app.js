// Interface de l'application.
import { BAILLEUR, LOGEMENTS, MOIS, LIEU_PAR_DEFAUT, SIGNATURE_URL, APP_VERSION } from "./config.js";
import { formatEuros, formatSaisie, lireMontant } from "./montant.js";
import { telechargerLocataires } from "./sheet.js";
import { chargerSignature, genererFichier, dateFr } from "./pdf.js";
import { reglages, envois, demanderPersistance } from "./storage.js";
import { texteMail, titreMail } from "./mail.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const etat = {
  locataires: [],
  ignorees: [],
  majLe: null,        // date de la dernière liste reçue du tableau
  horsLigne: false,
  enCours: true,      // première vérification de la liste en cours
  choisi: null,       // clé du locataire choisi
  envois: new Map(),  // suivi : « clé|année-mois » → { quand, qui, … } (gardé sur l'appareil)
};

/* ---------------------------------------------------------------- Messages */
function message(id, type, texte) {
  const el = $(id);
  el.className = "message " + (type || "");
  el.textContent = texte || "";
}
function effacerMessage(id) { message(id, "", ""); }

/* ---------------------------------------------------------------- Onglets */
function afficherOnglet(nom) {
  document.querySelectorAll(".onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.querySelectorAll("main > section").forEach((s) => s.classList.toggle("actif", s.id === "onglet-" + nom));
  if (nom === "locataires") afficherLocataires();
  if (nom === "suivi") afficherSuivi();
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
  // Un tableau non partagé ressemble aussi à une coupure réseau pour le navigateur : on mentionne Paul.
  reseau: "Impossible de charger la liste des locataires. Vérifiez que le wifi est allumé, puis appuyez sur « Réessayer ». Si cela continue, prévenez Paul.",
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
    const texteManuel = MSG_ERREUR[type].replace("« Réessayer »", "« Actualiser la liste »");
    if (etat.locataires.length) {
      afficherTout();
    } else {
      $("chargement").hidden = true;
      $("formulaire").hidden = true;
      $("sans-liste").hidden = false;
      $("sans-liste-texte").textContent = MSG_ERREUR[type];
    }
    if (manuel) message("message-locataires", "erreur", texteManuel);
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
  afficherSuivi();
}

/* ---------------------------------------------------------------- Onglet Créer */
function afficherChoix() {
  const { moisIdx, annee } = moisChoisi();
  const html = Object.keys(LOGEMENTS).map((k) => {
    const liste = etat.locataires.filter((l) => l.appt === k);
    if (!liste.length) return "";
    return `<div class="groupe" data-k="${k}">
      <div class="groupe-titre"><span class="tag" data-k="${k}">${k}</span>${esc(LOGEMENTS[k].adresse)}</div>
      <div class="choix">${liste.map((l) => `
        <button class="choix-btn${l.cle === etat.choisi ? " choisi" : ""}" data-cle="${esc(l.cle)}" aria-pressed="${l.cle === etat.choisi}">
          <span class="coche">${l.cle === etat.choisi ? "✓" : ""}</span>
          <span class="choix-texte">${esc(l.civ)} ${esc(l.nom)}${envoiDe(l.cle, annee, moisIdx)
            ? `<span class="choix-statut">✓ ${esc(MOIS[moisIdx])} déjà envoyée</span>` : ""}</span>
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
  const y = now.getFullYear();
  for (const [m, a] of [["c-mois", "c-annee"], ["s-mois", "s-annee"]]) {
    $(m).innerHTML = MOIS.map((x, i) => `<option value="${i}">${x}</option>`).join("");
    $(a).innerHTML = [y - 2, y - 1, y, y + 1].map((v) => `<option value="${v}">${v}</option>`).join("");
    $(m).value = String(now.getMonth());
    $(a).value = String(y);
  }
}
const moisChoisi = () => ({ moisIdx: +$("c-mois").value, annee: +$("c-annee").value });
const cleEnvoi = (cle, annee, moisIdx) => `${cle}|${annee}-${pad(moisIdx + 1)}`;
const envoiDe = (cle, annee, moisIdx) => etat.envois.get(cleEnvoi(cle, annee, moisIdx)) || null;

/** Change le mois de travail (le même dans « Créer » et « Suivi »). */
function changerMois(moisIdx, annee) {
  for (const [m, a] of [["c-mois", "c-annee"], ["s-mois", "s-annee"]]) {
    $(m).value = String(moisIdx); $(a).value = String(annee);
  }
  remplirFormulaire();
  afficherChoix();
  afficherTous();
  afficherSuivi();
}

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
  majDejaEnvoyee();
  document.querySelectorAll("#verif input").forEach((i) => i.classList.remove("invalide"));
  effacerMessage("message-creer");
  majTotal();
}

function majTotal() {
  const loyer = lireMontant($("c-loyer").value), charges = lireMontant($("c-charges").value || "0");
  $("c-total").textContent = loyer === null || charges === null ? "—" : formatEuros(loyer + charges);
}
$("c-mois").onchange = $("c-annee").onchange = () => changerMois(+$("c-mois").value, +$("c-annee").value);
$("s-mois").onchange = $("s-annee").onchange = () => changerMois(+$("s-mois").value, +$("s-annee").value);

/** Étape 4 : rappel si la quittance de ce mois est déjà partie. */
function majDejaEnvoyee() {
  const l = locataireChoisi();
  const { moisIdx, annee } = moisChoisi();
  const e = l && envoiDe(l.cle, annee, moisIdx);
  $("deja-envoyee").hidden = !e;
  if (e) $("deja-envoyee").textContent = `✓ La quittance de ${MOIS[moisIdx].toLowerCase()} ${annee} a déjà été envoyée ${quand(e.le)}.`;
}
$("c-loyer").oninput = $("c-charges").oninput = majTotal;

/** Toutes les informations de la quittance. */
function quittance(l, champs) {
  return {
    id: cleEnvoi(l.cle, champs.annee, champs.moisIdx),
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
  return quittance(l, {
    moisIdx, annee, loyer, charges, datePaiement, debut, fin, nom, dateQuittance,
    civ: $("c-civ").value,
    lieu: $("c-lieu").value.trim() || LIEU_PAR_DEFAUT,
  });
}

/* ---------------------------------------------------------------- Suivi des envois */
const MOIS_MIN = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « le 7 novembre 2026 à 14 h 05 » */
function quand(isoDate) {
  const d = new Date(isoDate);
  return `le ${d.getDate() === 1 ? "1er" : d.getDate()} ${MOIS_MIN[d.getMonth()]} ${d.getFullYear()} à\u00a0${d.getHours()}\u00a0h\u00a0${pad(d.getMinutes())}`;
}

function noterEnvoi(q) {
  const e = {
    id: q.id, cle: q.cle, appt: q.appt, civ: q.civ, nom: q.nom,
    moisIdx: q.moisIdx, annee: q.annee, total: q.loyer + q.charges,
    le: new Date().toISOString(),
  };
  etat.envois.set(e.id, e);
  envois.noter(e).catch((err) => console.error(err));
  afficherChoix();
  majDejaEnvoyee();
  afficherTous();
  afficherSuivi();
}

function oublierEnvoi(id) {
  etat.envois.delete(id);
  envois.oublier(id).catch((err) => console.error(err));
  afficherChoix();
  majDejaEnvoyee();
  afficherTous();
  afficherSuivi();
}

function afficherSuivi() {
  const { moisIdx, annee } = moisChoisi();
  const leMois = `${MOIS[moisIdx].toLowerCase()} ${annee}`;
  const actifs = Object.keys(LOGEMENTS).flatMap((k) => etat.locataires.filter((l) => l.appt === k));
  // envois de ce mois pour des personnes qui ne sont plus dans la liste
  const anciens = [...etat.envois.values()].filter((e) => e.annee === annee && e.moisIdx === moisIdx
    && !actifs.some((l) => l.cle === e.cle));
  const nbFaits = actifs.filter((l) => envoiDe(l.cle, annee, moisIdx)).length;

  $("suivi-bilan").className = "suivi-bilan " + (actifs.length && nbFaits === actifs.length ? "complet" : "");
  $("suivi-bilan").textContent = !actifs.length ? ""
    : nbFaits === actifs.length ? `✓ Toutes les quittances de ${leMois} sont envoyées.`
    : nbFaits === 0 ? `Aucune quittance de ${leMois} envoyée pour le moment.`
    : `${nbFaits} quittance${nbFaits > 1 ? "s" : ""} de ${leMois} envoyée${nbFaits > 1 ? "s" : ""} sur ${actifs.length}.`;

  const ligne = (appt, civ, nom, cle, e, actif) => `
    <div class="suivi-ligne ${e ? "fait" : "a-faire"}">
      <div class="suivi-qui">
        <span class="tag" data-k="${esc(appt)}">${esc(appt)}</span> <span class="qui">${esc(civ)} ${esc(nom)}</span>
        <span class="suivi-statut">${e ? `✓ Envoyée ${esc(quand(e.le))}` : "Pas encore envoyée"}</span>
      </div>
      ${e ? `<button class="btn btn-secondaire btn-petit" data-oublier="${esc(e.id)}">Marquer non envoyée</button>`
          : actif ? `<button class="btn btn-principal btn-petit" data-faire="${esc(cle)}">Faire la quittance</button>` : ""}
    </div>`;
  $("suivi-liste").innerHTML = (actifs.length || anciens.length) ? `<div class="carte">
      ${actifs.map((l) => ligne(l.appt, l.civ, l.nom, l.cle, envoiDe(l.cle, annee, moisIdx), true)).join("")}
      ${anciens.length ? `<p class="suivi-anciens">Plus dans la liste des locataires :</p>`
        + anciens.map((e) => ligne(e.appt, e.civ, e.nom, e.cle, e, false)).join("") : ""}
    </div>` : "";

  $("suivi-liste").querySelectorAll("[data-faire]").forEach((b) => {
    b.onclick = () => { afficherOnglet("creer"); choisirLocataire(b.dataset.faire, true); };
  });
  $("suivi-liste").querySelectorAll("[data-oublier]").forEach((b) => {
    b.onclick = () => {
      const e = etat.envois.get(b.dataset.oublier);
      if (e && confirm(`Marquer la quittance de ${MOIS[e.moisIdx].toLowerCase()} ${e.annee} de ${e.civ} ${e.nom} comme NON envoyée ?`)) {
        oublierEnvoi(e.id);
      }
    };
  });
}

/* ---------------------------------------------------------------- Envoi / téléchargement */
const peutPartager = (fichier) => {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })); }
  catch (e) { return false; }
};


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
    partage: "C'est fait.",
    annule: "Envoi annulé. Appuyez à nouveau sur « Envoyer par mail » pour recommencer.",
    echec: "L'envoi n'a pas pu s'ouvrir. Appuyez à nouveau sur « Envoyer par mail ».",
    telecharge: "Le PDF est téléchargé et votre messagerie s'ouvre : joignez le fichier au message.",
  },
  telecharger: {
    telecharge: "PDF téléchargé.",
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
  message("message-creer", "info", action === "envoyer" ? "Ouverture de l'envoi…" : "Préparation du PDF…");
  promesse.then((r) => {
    if (action === "envoyer" && (r === "partage" || r === "telecharge")) noterEnvoi(q);
    message("message-creer", r === "echec" ? "erreur" : r === "annule" ? "info" : "ok",
      MSG_LIVRAISON[action][r] || MSG_LIVRAISON[action].telecharge);
  });
}
$("btn-envoyer").onclick = () => creer("envoyer");
$("btn-telecharger").onclick = () => creer("telecharger");

/* ---------------------------------------------------------------- Tous les locataires du mois */
function afficherTous() {
  const { moisIdx, annee } = moisChoisi();
  $("tous-intro").innerHTML = `Pour <strong>${MOIS[moisIdx]} ${annee}</strong> (le mois choisi à l'étape 2), avec les montants de la liste `
    + `et un paiement le 1er du mois. Appuyez sur « Envoyer » pour chaque locataire, l'un après l'autre.`;
  $("tous-liste").innerHTML = etat.locataires.map((l) => {
    const fait = !!envoiDe(l.cle, annee, moisIdx);
    return `<div class="tous-ligne">
      <div><span class="tag" data-k="${l.appt}">${l.appt}</span> <span class="qui">${esc(l.civ)} ${esc(l.nom)}</span>
        <span class="combien">${formatEuros(l.loyer + l.charges)}</span>
        ${fait ? `<span class="fait">✓ Envoyée</span>` : ""}</div>
      <button class="btn ${fait ? "btn-secondaire" : "btn-principal"} btn-petit" data-cle="${esc(l.cle)}">${fait ? "Renvoyer" : "Envoyer"}</button>
    </div>`;
  }).join("");
  $("tous-liste").querySelectorAll("button[data-cle]").forEach((b) => { b.onclick = () => envoyerUn(b.dataset.cle); });
}

function envoyerUn(cle) {
  const l = etat.locataires.find((x) => x.cle === cle);
  if (!l) return;
  const { moisIdx, annee } = moisChoisi();
  const q = quittance(l, {
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
  promesse.then((r) => {
    const qui = `${l.civ} ${l.nom}`;
    if (r === "annule") message("message-tous", "info", `Envoi à ${qui} annulé. Vous pouvez recommencer.`);
    else if (r === "echec") message("message-tous", "erreur", `L'envoi à ${qui} n'a pas pu s'ouvrir. Appuyez à nouveau sur « Envoyer ».`);
    else {
      noterEnvoi(q);
      message("message-tous", "ok", `Quittance de ${qui} : c'est fait.`);
    }
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
  if (cacheeDepuis && Date.now() - cacheeDepuis > 60 * 60 * 1000) location.reload();
});

/* ---------------------------------------------------------------- Démarrage */
async function demarrer() {
  $("version").textContent = `Version ${APP_VERSION}`;
  initMois();
  enregistrerServiceWorker();
  demanderPersistance();

  try { await chargerSignature(SIGNATURE_URL); }
  catch (e) { console.error(e); }

  // 0) suivi des envois déjà faits sur cet appareil
  try {
    for (const e of (await envois.tous()) || []) etat.envois.set(e.id, e);
  } catch (e) { console.error(e); }
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
  // 2) liste à jour depuis le tableau
  await chargerListe();
  document.body.dataset.pret = "1";
}

window.__quittances = { etat, livrer, genererFichier }; // pour les tests
demarrer();
