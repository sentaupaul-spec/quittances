// ============================================================
//  Données fixes de l'application — LE SEUL FICHIER À MODIFIER
//  pour changer le bailleur, le SIRET, les logements ou le Sheet.
// ============================================================

export const BAILLEUR = {
  nom: "Annie Cresp",
  societe: "SCI CBI Annie Cresp",
  adresse: "60 rue Dora Maar",
  cp: "34070",
  ville: "Montpellier",
  // ⚠️ 17 chiffres : un SIRET en compte 14 (sans doute « 843 710 237 000 28 »).
  // À vérifier sur le Kbis puis corriger ici.
  siret: "843 710 237 000 28 000 12",
};

// Le code (MD1…) est interne : visible dans l'app, jamais sur la quittance.
export const LOGEMENTS = {
  MD1: { adresse: "9 rue Jean de Montlaur", cp: "34070", ville: "Montpellier", couleur: "#1f5fa8" },
  MD2: { adresse: "11 rue Guillaume d'Autignac", cp: "34070", ville: "Montpellier", couleur: "#2e7a3d" },
  MD3: { adresse: "10 rue Jean Raimond de Comminges", cp: "34070", ville: "Montpellier", couleur: "#b35f00" },
};

// Google Sheet des locataires (partagé « Tous les utilisateurs disposant du lien : Lecteur »).
export const SHEET_ID = "1QIWrw0728Bn01xriQSWWJtB1HxWUV_yNL8B-QrKn230";
// headers=1 : la ligne 1 est toujours l'en-tête.
// Alternative si besoin : URL « Publier sur le web » au format CSV (…/pub?output=csv).
export const SHEET_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1`;

export const LIEU_PAR_DEFAUT = "Montpellier";

// Affichée en bas de l'app : permet de vérifier que l'iPad a bien la dernière version.
export const APP_VERSION = "1.1.0";

export const SIGNATURE_URL = "assets/signature.png";
export const SIGNATURE_TAILLE_MM = { largeur: 60, hauteur: 38 };

export const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
  "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
