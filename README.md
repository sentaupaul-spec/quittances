# Quittances — SCI CBI Annie Cresp

Application web (PWA) pour iPad : Annie choisit un locataire et un mois, puis envoie la quittance
PDF par Mail depuis **son** compte. Tout est statique (GitHub Pages), sans serveur, sans compte, gratuit.
L'app ne conserve aucune quittance : elle les fabrique et les envoie, c'est tout (le mail envoyé reste dans
le dossier « Envoyés » de Mail).

- **Lien de l'app :** `https://sentaupaul-spec.github.io/quittances/`
- **Liste des locataires :** [Google Sheet](https://docs.google.com/spreadsheets/d/1QIWrw0728Bn01xriQSWWJtB1HxWUV_yNL8B-QrKn230/edit)
- Notice imprimable pour Annie : [`docs/notice-annie.pdf`](docs/notice-annie.pdf)
- Installation sur son iPad : [`docs/installation-ipad.md`](docs/installation-ipad.md)
- Ce que tu dois faire toi-même (clics exacts) : [`docs/a-faire-paul.md`](docs/a-faire-paul.md)

---

## 1. Mettre à jour les locataires

Tout se passe dans le Google Sheet. **Rien à faire dans l'app ni sur l'iPad** : la liste est relue à chaque ouverture
(et avec le bouton « Actualiser la liste » de l'onglet Locataires).

| Colonne | Contenu |
|---|---|
| `Appartement` | `MD1`, `MD2` ou `MD3` |
| `Civilité` | `Madame` / `Monsieur` |
| `Nom` | prénom et nom, tel qu'il doit apparaître sur la quittance |
| `Loyer`, `Charges` | montant mensuel : `550`, `550,00`, `1 200`, `50,5` sont acceptés |
| `Email` | facultatif — affiché sous le bouton « Envoyer par mail » pour l'aider |
| `Actif` | `oui` / `non`. Les lignes `non` sont ignorées (tu gardes l'historique dans le Sheet) |

- Les colonnes sont repérées **par leur titre** (majuscules et accents indifférents) : tu peux les réordonner ou en
  ajouter d'autres (« Remarque »…), l'app les ignore.
- Une ligne avec `Actif` vide est considérée comme **active**. Seul `non` (ou `0`, `faux`) la retire.
- Une ligne au logement inconnu (ex. `MD4`), sans loyer lisible ou en double est ignorée ; elle est signalée en bas
  de l'onglet Locataires par une « Note pour Paul ».
- Délai : immédiat en général, quelques minutes au pire (cache Google).
- ⚠️ Écris les montants comme des nombres (Google les aligne à droite). Le format CSV de Google peut vider une cellule
  « texte » au milieu d'une colonne de nombres. Si un loyer n'apparaît pas, retape-le simplement comme un nombre.

Ajouter un **nouveau logement** (MD4…) : ajoute-le dans `js/config.js` (`LOGEMENTS`), puis déploie (§2).

## 2. Déployer une nouvelle version

```bash
cd quittances
# … modifications …
python -m pytest -q        # tests (voir §5)
# incrémenter APP_VERSION dans js/config.js (affichée en bas de l'app)
git commit -am "Description du changement"
git push
```

GitHub Pages publie en 1 à 2 minutes. **Rien à faire sur l'iPad** : le service worker va toujours chercher la
dernière version quand il y a internet (stratégie « réseau d'abord »), et garde une copie pour fonctionner hors ligne.
Si l'app est restée ouverte en arrière-plan plus d'une heure, elle se recharge d'elle-même à son retour.
Pour vérifier : le numéro de version s'affiche tout en bas de l'app.

Si tu ajoutes un fichier (JS, image…), ajoute-le aussi à la liste `FICHIERS` dans `sw.js` pour qu'il marche hors ligne.

## 3. Corriger le SIRET

⚠️ Le numéro actuel `843 710 237 000 28 000 12` a **17 chiffres** ; un SIRET en a 14 (sans doute `843 710 237 000 28`).
Vérifie sur le Kbis, puis dans `js/config.js` :

```js
siret: "843 710 237 000 28",
```

Puis déploie (§2). Toutes les quittances créées ensuite auront le bon numéro.

## 4. Organisation du code

```
index.html               page unique (2 onglets : Créer, Locataires)
css/app.css              styles (accessibilité « senior » : texte ≥ 18 px, boutons ≥ 56 px)
js/config.js             ⭐ données fixes : bailleur, SIRET, logements, adresse du Sheet, version
js/sheet.js              lecture du Google Sheet (CSV) → locataires actifs
js/montant.js            montants en lettres, format « 1 280,50 € », lecture des montants
js/pdf.js                génération du PDF (jsPDF, synchrone), nom du fichier
js/storage.js            IndexedDB : dernière liste de locataires connue (hors ligne)
js/app.js                interface
sw.js                    service worker (hors ligne + mises à jour automatiques)
manifest.webmanifest     PWA (nom court « Quittances »)
vendor/jspdf.umd.min.js  jsPDF 2.5.1 embarqué (pas de CDN)
assets/signature.png     signature allégée utilisée dans le PDF (10 Ko)
assets/signature_annie_cresp.png   signature d'origine
icons/                   icônes écran d'accueil (180, 192, 512)
tools/generer_assets.py  régénère signature allégée + icônes
tests/                   tests (unitaires, parsing, PDF, bout en bout iPad)
docs/                    notice Annie, installation iPad, à faire
```

**Choix importants**

- **Partage dans le geste.** Le PDF est fabriqué de façon synchrone puis `navigator.share()` est appelé
  immédiatement (iOS refuse sinon).
- **Liste hors ligne.** La dernière liste reçue est gardée dans l'iPad ; sans réseau, l'app l'utilise et
  l'indique (« Pas de connexion internet : liste du … »).
- **Sur ordinateur** (pas de menu Partager) : le PDF est téléchargé et la messagerie s'ouvre (`mailto:`) avec
  destinataire, objet et texte ; il reste à joindre le fichier.
- **« Envoyer les quittances de tous les locataires »** (repliée en bas de l'onglet Créer) : une ligne par
  locataire avec son bouton « Envoyer », coche ✓ « Envoyée » (le temps que l'app reste ouverte).
  Montants du Sheet, paiement le 1er.
- **Aucune archive.** Rien n'est conservé sur l'iPad à part la dernière liste de locataires. Pour retrouver une
  ancienne quittance : dossier « Envoyés » de Mail, ou la refaire dans l'app (même mois, mêmes montants).


## 5. Tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r tests/requirements.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python -m pytest -q
```

- `test_montant.py` : montants en lettres (0, 1, 21, 71, 80, 81, 91, 99, 100, 200, 250, 600, 1 000, 1 280,50,
  2 000 et d'autres), format et lecture des montants.
- `test_sheet.py` : colonnes dans le désordre, accents/casse des en-têtes, « 1 200,50 », lignes vides,
  `Actif = non`, logement inconnu, guillemets, doublons, erreurs d'accès.
- `test_pdf.py` : 1 page A4, < 200 Ko, **texte identique** à `exemple_quittance_reference.pdf`, comparaison
  pixel à pixel avec la référence, positions signature/tampon, pas de débordement (noms et montants très longs).
- `test_app.py` (Playwright, 820×1180 et 1180×820, Sheet simulé) : liste, création + partage, partage annulé,
  saisie invalide, envoi « tous les locataires », modification du Sheet prise en compte, hors ligne, Sheet non
  partagé, bandeau Safari, rien n'est conservé, tailles minimales du texte et des boutons.

Les rendus (captures d'écran, PDF) sont écrits dans `tests/_sortie/` (non versionné).
