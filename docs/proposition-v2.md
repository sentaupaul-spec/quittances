# Proposition V2 — à valider avant de coder

## A. Archives automatiques dans Google Drive

**Faisable, oui**, sans rien changer pour Annie (aucune connexion de son côté).

**Principe**
1. Un Google Apps Script, créé sous ton compte, déployé en « Application Web »
   (« Exécuter en tant que : moi », « Accès : tout le monde »).
2. Après chaque quittance, l'app envoie au script le PDF (≈ 17 Ko) + logement, locataire, mois.
3. Le script range le fichier : `Quittances/MD2 — 11 rue Guillaume d'Autignac/Madame Julie Martin/Quittance_Novembre_2026_Julie_Martin.pdf`
   (même mois → le fichier est remplacé), et ajoute une ligne au journal (§B).
4. Sans internet : l'envoi est mis en attente dans l'iPad et repart tout seul à la prochaine ouverture avec
   réseau. Annie ne voit rien, sauf éventuellement « Copie Drive : en attente » en petit dans les Archives.

**Limites**
- *Quotas* (compte Gmail gratuit) : temps d'exécution 6 min par appel (ici < 2 s), 30 appels simultanés,
  ~90 min de déclencheurs par jour — très loin des ~15 quittances par mois. Stockage : 15 Go partagés,
  1 000 quittances ≈ 17 Mo.
- *Sécurité de l'URL du script* : c'est le vrai point. L'URL sera visible dans le code (le dépôt GitHub est public),
  donc **n'importe qui la trouvant pourrait déposer des fichiers** dans ton dossier. Il ne pourra **rien lire**
  (le script ne renvoie aucune donnée). Protections prévues : le script n'accepte que de vrais PDF de moins de
  300 Ko, des logements MD1/MD2/MD3, des noms de fichiers au bon format, au plus ~50 dépôts par jour, et n'écrit
  que dans le dossier `Quittances`. Un jeton « secret » dans l'app ne servirait à rien (il serait public lui aussi).
- *Ce que Drive ne sait pas* : si le mail a vraiment été envoyé. L'app sait seulement que le menu Partager
  s'est terminé.
- Si tu changes de compte Google ou supprimes le script, les dépôts échouent (sans bloquer l'app).

**Temps de mise en place** : ~1 h de mon côté (script + file d'attente + tests) ; ~15 min de clics pour toi
(créer le script, coller le code, déployer, autoriser l'accès à ton Drive, me donner l'URL).

## B. Journal des quittances dans le Google Sheet

Même script, même appel : un onglet `Journal` avec une ligne par quittance :
`date/heure · logement · locataire · mois · montant · action (envoyée / téléchargée / renvoyée depuis les archives)`.
Tu vois à distance ce qui a été fait, et tu peux repérer un mois oublié. Coût supplémentaire : ~15 min.

## Bonus possible

- Restaurer les archives d'un nouvel iPad **depuis Drive** (au lieu du fichier de sauvegarde).
- Un rappel visuel dans l'app : « Ce mois-ci, il reste 2 quittances à faire » (à partir des archives locales).
