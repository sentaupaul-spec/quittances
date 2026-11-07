# Ce que tu dois faire toi-même

## 1. Partager le Google Sheet (indispensable)

Sans ça, l'app affiche « La liste des locataires n'est pas accessible pour le moment. Prévenez Paul. »

1. Ouvre le [Sheet](https://docs.google.com/spreadsheets/d/1QIWrw0728Bn01xriQSWWJtB1HxWUV_yNL8B-QrKn230/edit).
2. Bouton **Partager** (en haut à droite).
3. Sous **Accès général**, remplace « Limité » par **« Tous les utilisateurs disposant du lien »**.
4. À droite, laisse le rôle sur **« Lecteur »**.
5. **OK**.

Contrôle : ouvre dans une fenêtre de navigation privée
`https://docs.google.com/spreadsheets/d/1QIWrw0728Bn01xriQSWWJtB1HxWUV_yNL8B-QrKn230/gviz/tq?tqx=out:csv&headers=1`
→ un fichier CSV doit se télécharger (pas une page de connexion Google).

> ℹ️ Toute personne ayant ce lien peut lire les noms, loyers et e-mails des locataires. Le lien figure dans le code
> de l'app (public). Si tu préfères limiter ce qui est exposé, retire la colonne Email du Sheet (elle n'est qu'une aide).

**Si le lien `gviz` posait problème** (par exemple une cellule montant qui apparaît vide) : Fichier › Partager ›
**Publier sur le web** › choisir la feuille › format **Valeurs séparées par des virgules (.csv)** › Publier ›
copier le lien, puis le coller dans `js/config.js` à la place de `SHEET_CSV_URL` et déployer.

## 2. GitHub Pages

Le dépôt est publié dans `https://github.com/<ton-compte>/quittances`. Si GitHub Pages n'est pas déjà activé :
dépôt › **Settings** › **Pages** › *Build and deployment* › Source **« Deploy from a branch »** › Branch **`main`**,
dossier **`/ (root)`** › **Save**. Le lien apparaît en haut de la même page après 1 à 2 minutes.

## 3. Vérifier le SIRET

Le numéro `843 710 237 000 28 000 12` a 17 chiffres (un SIRET en a 14). Vérifie sur le Kbis puis corrige
`js/config.js` (voir README §3).

## 4. Installer sur l'iPad d'Annie

Suivre [`installation-ipad.md`](installation-ipad.md). Imprimer [`notice-annie.pdf`](notice-annie.pdf) et y écrire
ton numéro.

## 5. De temps en temps

- Mettre le Sheet à jour quand un locataire change (README §1).
- Tous les 2–3 mois, faire une sauvegarde des archives depuis l'iPad (onglet Archives), ou passer à la V2 Drive.
