# Mode démonstration — SahaTN

> **Prototype de démonstration.** Toutes les données décrites ici sont
> **fictives et générées** (ADR-0007, ADR-0015). Aucune donnée médicale réelle
> n'est utilisée, demandée ni exposée. Le prototype ne doit **jamais** servir à
> des soins ou à des décisions médicales.

Ce document décrit le jeu de données de démonstration créé par
`backend/prisma/seed.mjs` et la manière de le rejouer sans risque.

---

## 1. Objectif

Fournir un environnement **complet et cohérent** permettant de parcourir tous
les parcours produits à partir de comptes synthétiques :

- annuaire public (praticiens vérifiés et non vérifiés, établissements
  publics/privés) ;
- prise de rendez-vous dans plusieurs états ;
- dossier médical longitudinal (consultations, observations, diagnostics,
  allergies) ;
- documents médicaux (métadonnées + contenu binaire hors base) ;
- consentement (autorisations granulaires) et cloisonnement d'accès ;
- notifications (file d'envoi) et journal d'accès auditable.

Le seed est **idempotent** : le rejouer ne crée jamais de doublon. Il est
**déterministe** pour tout ce qui a trait à l'identité des entrées de
démonstration (clés stables dérivées d'e-mails ou de libellés, ancre temporelle
fixe).

---

## 2. Comptes de démonstration

Mot de passe commun : **`DemoPassw0rd!2024`** (haché en Argon2id, paramètres
`memoryCost=19456`, `timeCost=2`, `parallelism=1`). Ces comptes sont **non
privilégiés** ; aucun compte administrateur n'est publié ici (créé hors seed via
`scripts/create-admin.mjs`).

| Rôle | E-mail | État | Données associées |
| --- | --- | --- | --- |
| Patient | `demo.patient@sahatn.example` | ACTIVE | Dossier médical complet, consentement, documents |
| Patient | `demo.patient2@sahatn.example` | ACTIVE | Dossier vide (aucun consentement) |
| Médecin | `demo.doctor@sahatn.example` | Profil **VERIFIED**, listé | Dr Mounir Trabelsi, généraliste + cardiologie |
| Médecin | `demo.doctor2@sahatn.example` | Profil **PENDING**, non listé | Dr Salma Ben Youssef, cardiologue (ne peut rien voir) |
| Personnel d'établissement | `demo.staff@sahatn.example` | ACTIVE | Gestionnaire de l'Hôpital universitaire Jabal Al-Fikr |

Le page `/demo` du frontend rappelle ces comptes et les limites du prototype.

---

## 3. Contenu créé

Référentiels (idempotents) :

- **36 spécialités** (libellés FR/AR de démonstration, à valider par un
  référentiel institutionnel avant production — voir `docs/reference-data.md`).
- **24 établissements** couvrant les 24 gouvernorats (faits géographiques ;
  noms, adresses et téléphones **fictifs**), secteurs public et privé.

Données applicatives :

- **5 comptes** (2 praticiens, 2 patients, 1 personnel), rôles associés.
- **2 affiliations vérifiées** praticien ↔ établissement.
- **1 agenda** (mode de confirmation `MANUAL`) rattaché à l'affiliation du
  praticien vérifié.
- **5 rendez-vous** dans états variés : `COMPLETED`, `CONFIRMED`, `PENDING`,
  `CANCELLED`, `NO_SHOW`, chacun avec son historique d'événements append-only.
- **2 notifications** (rendez-vous confirmé / terminé) dans la file d'envoi.
- **1 consentement** (`MedicalRecordGrant`, portées lecture **et** écriture) du
  patient principal vers le praticien vérifié, + la relation de soins associée.
- **1 consultation** avec **4 observations**, **1 diagnostic**, **1 allergie**.
- **3 documents médicaux** (compte rendu, résultat d'analyse, ordonnance) :
  métadonnées en base, contenu binaire **hors base** dans un espace privé, avec
  empreinte SHA-256 pour l'intégrité.
- **1 accès refusé journalisé** (le praticien non vérifié tente d'accéder au
  dossier) : démonstration de l'auditabilité des refus.

### Cloisonnement démontré

- Le praticien **vérifié** ne voit **que** le patient qui a consenti
  (`demo.patient`) — jamais le second patient.
- Le praticien **non vérifié** (`PENDING`) ne voit **aucun** dossier, même en
  présence d'un rendez-vous.
- Un identifiant de dossier arbitraire ne révèle rien (404/403).

---

## 4. Stockage des documents

Le contenu binaire n'est **jamais** stocké en base (`MedicalDocument` ne
contient que des métadonnées). Le seed écrit les fichiers dans un répertoire
**privé**, hors de tout répertoire servi par un serveur web :

- racine par défaut : `backend/storage/private-documents` ;
- surchargeable par `DOCUMENT_STORAGE_DIR` ;
- clés générées par le serveur (`documents/demo/<hash>`), jamais dérivées du nom
  de fichier fourni ;
- permissions restreintes ; toute clé tentant de sortir de la racine est rejetée.

Le seed produit des images **PNG synthétiques** minimales (signature + IHDR) afin
que la détection de type par *magic bytes* — la même que le service réel —
reconnaisse `image/png`.

---

## 5. Rejouer le seed

```powershell
# Depuis backend/ — base de développement persistante (port 55434)
npm run dev:db
```

ou, sur une base déjà migrée :

```powershell
# Depuis backend/ — nécessite DATABASE_URL
npm run db:seed
```

Le seed peut être exécuté un nombre quelconque de fois : les compteurs de lignes
restent stables.

---

## 6. Limites connues

- Certains contrôles de production ne sont **pas** opérationnels : MFA/2FA,
  chiffrement au repos, antivirus sur les dépôts, alerting temps réel des accès
  d'urgence, sauvegardes/restauration.
- Aucune revendication de conformité réglementaire ni de disponibilité pour un
  usage clinique réel.
- Les durées de conservation légales ne sont pas définies (à valider par un
  juriste).
- Les libellés de référentiels sont des exemples internes.
- Le stockage de documents est local : une architecture multi-instance exigera un
  stockage objet privé (S3-compatible), non implémenté à ce stade.

Voir `docs/decisions/0015-posture-securite-prototype-demo.md` pour la posture de
sécurité associée, et `docs/SAHATN_DEPLOYMENT_READINESS.md` pour l'état de
préparation au déploiement.
