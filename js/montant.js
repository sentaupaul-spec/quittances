// Montants : conversion en lettres (orthographe traditionnelle), format et lecture.

const UNITES = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

// 0..99
function moinsDeCent(x) {
  if (x < 20) return UNITES[x];
  const d = Math.floor(x / 10), u = x % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? "soixante" : "quatre-vingt";
    if (d === 7 && u === 1) return "soixante et onze";
    return base + "-" + UNITES[10 + u];
  }
  if (d === 8) return u === 0 ? "quatre-vingts" : "quatre-vingt-" + UNITES[u];
  if (u === 0) return DIZAINES[d];
  if (u === 1) return DIZAINES[d] + " et un";
  return DIZAINES[d] + "-" + UNITES[u];
}

// 0..999 ; `final` = le nombre n'est suivi de rien (accord de « cents » / « quatre-vingts »)
function moinsDeMille(x, final) {
  const c = Math.floor(x / 100), r = x % 100;
  let s;
  if (c === 0) s = moinsDeCent(r);
  else {
    const cent = c === 1 ? "cent" : UNITES[c] + " cent" + (r === 0 && final ? "s" : "");
    s = r ? cent + " " + moinsDeCent(r) : cent;
  }
  if (!final) s = s.replace(/quatre-vingts$/, "quatre-vingt");
  return s;
}

/** Entier positif (< 1 milliard) en lettres. */
export function entierEnLettres(n) {
  if (n === 0) return "zéro";
  const millions = Math.floor(n / 1e6), milliers = Math.floor((n % 1e6) / 1000), reste = n % 1000;
  const parts = [];
  if (millions) parts.push(millions === 1 ? "un million" : moinsDeMille(millions, true) + " millions");
  if (milliers) parts.push(milliers === 1 ? "mille" : moinsDeMille(milliers, false) + " mille");
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(" ");
}

/** Montant en euros en toutes lettres, en minuscules. Ex. 1280.5 → « mille deux cent quatre-vingts euros et cinquante centimes » */
export function montantEnLettres(montant) {
  const totalCentimes = Math.round(Math.abs(Number(montant) || 0) * 100);
  const euros = Math.floor(totalCentimes / 100), centimes = totalCentimes % 100;
  const partCentimes = centimes ? entierEnLettres(centimes) + " centime" + (centimes > 1 ? "s" : "") : "";
  if (euros === 0 && centimes) return partCentimes;
  let s = entierEnLettres(euros);
  // « un million d'euros », « deux millions d'euros »
  const de = euros >= 1e6 && euros % 1e6 === 0;
  s += de ? " d'euros" : " euro" + (euros > 1 ? "s" : "");
  if (centimes) s += " et " + partCentimes;
  return s;
}

/** 1280.5 → « 1 280,50 € » (espaces ordinaires : compatibles avec la police du PDF). */
export function formatEuros(montant) {
  const totalCentimes = Math.round((Number(montant) || 0) * 100);
  const neg = totalCentimes < 0;
  const abs = Math.abs(totalCentimes);
  const ent = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = String(abs % 100).padStart(2, "0");
  return (neg ? "-" : "") + ent + "," + dec + " €";
}

/** Pour les champs de saisie : 520 → « 520,00 ». */
export function formatSaisie(montant) {
  return formatEuros(montant).replace(" €", "");
}

/**
 * Lit un montant tapé à la main ou venant du tableau.
 * Accepte « 550 », « 550,00 », « 1 200 », « 50,5 », « 1 200,50 », « 1.200,50 », « 550 € », « 550.5 ».
 * Renvoie un nombre, ou null si illisible.
 */
export function lireMontant(valeur) {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : null;
  let s = String(valeur ?? "").trim();
  if (!s) return null;
  s = s.replace(/[\s  €]|eur(os?)?/gi, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Le dernier séparateur est la virgule décimale, l'autre sépare les milliers.
    const dec = lastComma > lastDot ? "," : ".";
    const mil = dec === "," ? "." : ",";
    s = s.split(mil).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) || []).length > 1) s = s.split(",").join("");
    else s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    const nbPoints = (s.match(/\./g) || []).length;
    // « 1.200 » ou « 1.200.000 » : points de milliers
    if (nbPoints > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
