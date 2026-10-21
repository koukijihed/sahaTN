# SahaTN

Plateforme nationale de santé pour la Tunisie.

SahaTN vise à relier les patients, les professionnels de santé et les établissements
(publics et privés) au sein d'un écosystème de santé interopérable, sécurisé et
traçable : recherche de médecins et d'établissements, prise de rendez-vous, espaces
professionnels vérifiés, comptes rendus médicaux et historique médical longitudinal.

> **Statut : Jour 16 — intégration continue en place.**
> Identité (Jour 2), espaces professionnels vérifiés (Jour 3), établissements et
> affiliations (Jour 4), recherche (Jour 5), rendez-vous (Jours 6-8), dossier
> médical longitudinal et consentement (Jours 9-10), export FHIR R4 (Jour 11),
> documents médicaux (Jour 12), couche UX (Jours 13-14), fiabilité de la
> configuration (Jour 15) et **CI GitHub Actions** (Jour 16) sont livrés.
> **Couverture de tests : 204 tests unitaires backend, 121 tests e2e backend,
> 43 tests navigateur (Playwright + axe-core).** Plusieurs fonctions restent
> volontairement hors périmètre (MFA, envoi réel d'e-mails/SMS, prescriptions,
> sauvegardes, déploiement automatisé) : voir [`docs/roadmap.md`](docs/roadmap.md)
> et [`docs/ci.md`](docs/ci.md).
>
> **Mode démonstration** : SahaTN est exposé comme **prototype de démonstration à
> données synthétiques uniquement** (bandeau visible dans l'UI). Aucune donnée
> médicale réelle, aucun usage clinique. Voir [`docs/DEMO_MODE.md`](docs/DEMO_MODE.md)
> et le runbook [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 1. Objectifs

SahaTN doit, à terme, permettre de :

- Rechercher des médecins et des établissements publics ou privés.
- Prendre, modifier et annuler des rendez-vous.
- Offrir aux médecins un espace professionnel unique et vérifié.
- Permettre aux médecins autorisés de rédiger des comptes rendus et de consulter les
  informations médicales pertinentes de leurs patients.
- Constituer un historique médical longitudinal par patient.
- Relier progressivement établissements, professionnels et services de santé.
- Protéger les données médicales (contrôle d'accès strict, traçabilité complète).

## 2. Principes directeurs

1. **Sécurité dès la conception.** Les données de santé sont hautement sensibles.
   Une authentification réussie ne suffit jamais à accéder à un dossier médical.
2. **Modularité avant distribution.** On commence par un monolithe modulaire aux
   frontières de domaines claires ; on évite les microservices prématurés.
3. **Interopérabilité progressive.** Toute intégration avec un système national ou
   existant doit être confirmée et autorisée avant mise en œuvre.
4. **Aucune donnée réelle.** Tous les exemples et jeux de données sont fictifs.
5. **Vérifier plutôt qu'affirmer.** Aucune conformité réglementaire n'est considérée
   comme acquise sans validation juridique ou institutionnelle.

## 3. Stack technique (cible)

| Couche            | Technologie                            | Statut        |
| ----------------- | -------------------------------------- | ------------- |
| Frontend          | Next.js + React + TypeScript           | Retenu        |
| Backend           | NestJS + TypeScript (API REST)         | Retenu        |
| Base de données   | PostgreSQL                             | Retenu        |
| ORM / migrations  | Prisma                                 | Retenu        |
| Validation        | Validation stricte côté serveur        | Exigence      |
| Tests             | Unitaires, intégration, e2e            | Exigence      |
| Environnement     | Docker + Docker Compose                | Retenu        |
| Documentation API | OpenAPI (Swagger)                      | Disponible    |

Justifications et alternatives : voir [`docs/decisions/`](docs/decisions/).

## 4. Structure du dépôt

```text
sahatn/
├── README.md                  # Ce fichier
├── docs/
│   ├── vision.md              # Vision fonctionnelle
│   ├── architecture.md        # Architecture et responsabilités
│   ├── security.md            # Exigences de sécurité et modèle de menace
│   ├── roadmap.md             # Étapes, dépendances, risques, validations
│   └── decisions/             # Décisions d'architecture (ADR)
├── backend/                   # API NestJS + Prisma
│   ├── prisma/                # Schéma et migrations
│   ├── scripts/               # Outils dev (PostgreSQL embarqué, admin)
│   └── src/                   # Code source (modules, config, common)
├── frontend/                  # Application Next.js
│   ├── app/                   # Pages (App Router)
│   └── lib/                   # Client API
├── infra/                     # Ressources d'infrastructure (PostgreSQL, etc.)
├── docker-compose.yml         # Orchestration de l'environnement de développement
└── .env.example               # Variables d'environnement (aucun secret réel)
```

### 4.1 Module d'identité (Jour 2)

Endpoints exposés (préfixe `/api`) :

| Méthode | Chemin            | Description                             |
| ------- | ----------------- | --------------------------------------- |
| `POST`  | `/auth/register`  | Créer un compte **patient**             |
| `POST`  | `/auth/login`     | Ouvrir une session                      |
| `POST`  | `/auth/logout`    | Révoquer la session courante            |
| `GET`   | `/auth/me`        | Profil non sensible de l'utilisateur    |

Sécurité : Argon2id, sessions opaques révocables en base, cookies `HttpOnly`/`SameSite`,
protection CSRF, vérification d'origine, anti-force brute. Voir
[`docs/security.md`](docs/security.md),
[ADR-0008](docs/decisions/0008-sessions-et-csrf.md) et
[ADR-0009](docs/decisions/0009-anti-force-brute.md).

### 4.2 Modules professionnels et vérification (Jour 3)

Endpoints exposés (préfixe `/api`, session requise sauf mention contraire) :

| Méthode | Chemin                                                    | Description                                                          |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET`   | `/specialties`                                            | Référentiel public des spécialités actives                           |
| `POST`  | `/specialties`                                            | Créer une spécialité (admin uniquement)                              |
| `PATCH` | `/specialties/:id`                                        | Modifier une spécialité (admin uniquement)                           |
| `GET`   | `/doctors/me`                                             | Consulter son propre profil professionnel                            |
| `PUT`   | `/doctors/me`                                             | Créer/compléter son propre profil (champs autorisés uniquement)      |
| `GET`   | `/doctors/me/credentials`                                 | Métadonnées de ses qualifications                                    |
| `POST`  | `/doctors/me/credentials`                                 | Déclarer une qualification (métadonnées, aucun document stocké)      |
| `PUT`   | `/doctors/me/visibility`                                  | Publier son profil dans le répertoire (médecins **vérifiés** inclus) |
| `POST`  | `/doctors/me/verification`                                | Créer (brouillon) ou soumettre sa demande de vérification            |
| `GET`   | `/doctors/me/verification`                                | Consulter sa dernière demande (et son historique)                    |
| `GET`   | `/admin/doctor-verifications`                             | Lister les demandes (admin uniquement)                               |
| `GET`   | `/admin/doctor-verifications/:id`                         | Consulter une demande et son audit (admin uniquement)                |
| `POST`   | `/admin/doctor-verifications/:id/decision`               | Décision admin : `START_REVIEW`, `REQUEST_CORRECTION`, `APPROVE`, `REJECT`, `REVOKE` |
| `GET`   | `/doctors/:id`                                            | Profil public (publique, 404 si non vérifié et non listé)            |

Règles de sécurité mises en œuvre et testées (voir `backend/test/doctors.e2e-spec.ts`) :

- Refus de l'auto-attribution d'un rôle ou d'un statut de vérification par le client.
- Refus pour un professionnel de décider de **sa propre** demande de vérification.
- Actions réservées aux administrateurs ; demandes non administrables par un patient
  (aucune donnée confidentielle dans les erreurs).
- Décisions limitées à des **transitions d'état valides** (journalisées) et requérant un
  motif pour les refus/revocations.
- Attribution du rôle `DOCTOR` **uniquement** après approbation administrative.
- Publication dans le répertoire public réservée aux professionnels vérifiés ; les
  profils non vérifiés ou non listés renvoient `404` (indiscernables).

### 4.3 Établissements et affiliations (Jour 4)

Endpoints exposés (préfixe `/api`, publique sauf mention contraire) :

| Méthode | Chemin                                       | Description                                                          |
| ------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `GET`   | `/facilities`                                | Répertoire public, paginé et filtré (recherche, gouvernorat, secteur, type) |
| `GET`   | `/facilities/:id`                            | Fiche publique (404 si non vérifié et non listé)                     |
| `POST`  | `/facilities`                                | Créer un établissement (session requise)                             |
| `GET`   | `/facilities/:id/manage`                     | Vue de gestion (gestionnaire uniquement)                             |
| `PUT`   | `/facilities/:id/manage`                     | Modifier l'établissement (gestionnaire uniquement)                   |
| `POST`  | `/facilities/:id/verification`               | Créer (brouillon) ou soumettre une demande de vérification (gestionnaire) |
| `POST`  | `/facilities/:id/affiliations`               | Demander une affiliation (médecin)                                   |
| `DELETE`| `/facilities/:id/affiliations/:affiliationId`| Mettre fin à une affiliation active (médecin)                        |
| `GET`   | `/doctors/me/affiliations`                   | Affiliations du médecin courant                                      |
| `GET`   | `/admin/facilities`                          | Lister les établissements (admin uniquement)                         |
| `GET`   | `/admin/facilities/:id`                      | Détail administratif (admin uniquement)                              |
| `POST`  | `/admin/facilities/:id/decision`             | Décision de vérification : `START_REVIEW`, `REQUEST_CORRECTION`, `APPROVE`, `REJECT`, `SUSPEND` (admin) |
| `POST`  | `/admin/facilities/:id/managers`             | Nommer un gestionnaire (admin uniquement)                            |
| `DELETE`| `/admin/facilities/:id/managers/:userId`     | Retirer un gestionnaire (admin uniquement)                           |
| `POST`  | `/admin/facility-affiliations/:id/decision`  | Décision sur une affiliation : `APPROVE`/`REJECT` (admin)            |

Règles de sécurité mises en œuvre et testées (voir `backend/test/facilities.e2e-spec.ts`) :

- Répertoire public limité aux établissements **vérifiés** et **publiés** ; les autres
  renvoient `404` sans révéler leur existence.
- Gestion et soumission de vérification réservées aux **gestionnaires** nommés par un
  administrateur (droits limités à la ressource, aucun rôle global).
- Workflow de vérification administré exclusivement par un admin ; décisions limitées à
  des transitions valides et motife requises pour refus/correction/suspension ; une seule
  demande active par établissement.
- Affiliations : une seule active par paire médecin-établissement ; décision admin
  uniquement ; seules les affiliations vérifiées sont visibles publiquement.

Pages frontend : `/facilities` (répertoire + recherche), `/facilities/[id]`,
`/facilities/[id]/manage` (espace de gestion), `/dashboard/affiliations` (médecin).

## 5. Démarrage rapide (via Docker)

> Prérequis : Docker Desktop (si disponible).

```bash
# 1. Depuis la racine du dépôt
cp .env.example .env

# 2. Démarrer PostgreSQL + API + Frontend
docker compose up --build
```

**Ou directement en production locale (sans Docker)** :
```bash
pwsh ./deploy.ps1  # lance backend + frontend + Postgres embarqué (port 55435)
```

**Déploiement cloud (démonstration, données synthétiques uniquement)** : voir le
runbook [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (Neon → Render → Vercel).
`render.yaml` (Blueprint Render, backend uniquement) est fourni et exécute les
migrations **et** le seed de démonstration au build ; le frontend est détecté
automatiquement par Vercel (racine de projet `frontend/`). Pour une base managée
(Neon/Supabase/Railway), voir [`docs/neon.md`](docs/neon.md) (définir
`DATABASE_URL` avec `?sslmode=require`).

- Frontend : http://localhost:3000
- API : http://localhost:4000/api
- Santé de l'API : http://localhost:4000/api/health
- PostgreSQL : localhost:5432 (identifiants dans `.env`)

## 6. Développement local (sans Docker)

> Prérequis : Node.js 20 LTS (ou plus récent), npm. PostgreSQL est **optionnel** en
> développement : les scripts `db:migrate:dev` et `test:e2e` démarrent une instance
> **PostgreSQL embarquée** (`embedded-postgres`), sans installation système ni
> privilèges administrateur.

```bash
# Backend - terminal 1 : base PostgreSQL locale persistante (migrations + données fictives)
cd backend
cp .env.example .env
npm install
npx prisma generate
npm run dev:db           # reste actif ; Ctrl+C pour arrêter

# Backend - terminal 2
cd backend
npm run start:dev        # http://localhost:4000/api
```

`npm run dev:db` démarre une instance **PostgreSQL persistante** dans
`backend/.dev-postgres` (port `55434` par défaut, variable `DEV_DB_PORT`), applique les
migrations, charge les données de démonstration et **reste actif**. Contrairement à
`npm run db:migrate:dev` (instance éphémère supprimée en fin d'exécution), elle conserve
les données entre deux démarrages : c'est la méthode recommandée pour se connecter à
l'application en local.

> Aligner `DATABASE_URL` dans `backend/.env` sur l'instance `dev:db`
> (`postgresql://postgres:postgres@localhost:55434/sahatn`) pour que `npm run start:dev`
> s'y connecte. Pour utiliser une instance PostgreSQL existante, renseigner plutôt sa
> `DATABASE_URL` et lancer `npx prisma migrate dev` directement. Les commandes
> `npm run db:migrate:dev` et `npm run test:e2e` acceptent une variable
> `TEST_DATABASE_URL` pour cibler une base externe.
>
> Compte administrateur local (optionnel) : relancer `npm run dev:db` avec
> `DEV_ADMIN_EMAIL` et `DEV_ADMIN_PASSWORD` (≥ 12 caractères) crée ou met à jour un
> compte `ADMIN` ; `npm run create-admin` fait la même chose sur une base déjà fournie.

```bash
# Frontend (dans un autre terminal)
cd frontend
cp .env.example .env
npm install
npm run dev              # http://localhost:3000  (proxy /api/* vers le backend)
```

### 6.1 Données de démonstration (fictives)

`npm run db:seed` (déclenché aussi par `npx prisma migrate reset --force`) insère des
données **100 % fictives** (ADR-0007) : 36 spécialités, 24 établissements répartis sur
les 24 gouvernorats, un médecin vérifié avec une affiliation, et deux comptes de
démonstration :

| Compte   | Email                    | Téléphone     | Mot de passe        | Rôle           |
| -------- | ------------------------ | ------------- | ------------------- | -------------- |
| Médecin  | `demo.doctor@sahatn.example` | +216 20 000 001 | `DemoPassw0rd!2024` | `DOCTOR`       |
| Personnel| `demo.staff@sahatn.example`  | +216 20 000 002 | `DemoPassw0rd!2024` | `FACILITY_STAFF` |

Le médecin de démonstration est **vérifié** et a une affiliation vérifiée avec la
Polyclinique Les Palmiers ; le compte personnel gère l'Hôpital universitaire Jabal
Al-Fikr. Ces comptes ne doivent servir qu'au développement local.

## 7. Scripts utiles

**Backend** (`backend/`)

```bash
npm run start:dev     # Démarrage en mode watch
npm run build         # Compilation TypeScript
npm run lint          # Analyse statique
npm run typecheck     # Vérification des types
npm run test          # Tests unitaires
npm run test:e2e      # Tests e2e (PostgreSQL embarqué + migrations déployées)
npm run dev:db        # Base locale persistante + migrations + données fictives (reste actif)
npm run db:migrate:dev -- --name <nom>   # Créer/appliquer une migration (PostgreSQL embarqué éphémère)
npm run db:seed          # Insérer les données de démonstration (fictives, ADR-0007)
npm run create-admin  # Créer un compte ADMIN (ADMIN_EMAIL / ADMIN_PASSWORD requis)
```

**Frontend** (`frontend/`)

```bash
npm run dev              # Démarrage en mode watch
npm run build            # Compilation de production
npm run lint             # Analyse statique
npm run typecheck        # Vérification des types
npm run test:e2e         # Tests navigateur Playwright (Chromium) + axe-core
npm run test:e2e:report  # Ouvrir le rapport Playwright (après échec)
```

> Prérequis des tests navigateur : `npm run build` côté backend (pour `dist/main.js`) et
> `npx playwright install chromium`. Détail des contrôles automatisés, des commandes
> locales et du diagnostic d'échec : [`docs/ci.md`](docs/ci.md).

## 8. Règles de travail du projet

- Ne pas développer toute la plateforme d'un coup : avancer par étapes.
- N'ajouter une dépendance qu'avec justification et documentation.
- Ne jamais introduire de données médicales réelles.
- Ne jamais stocker de secrets dans le dépôt (utiliser `.env`, non versionné).
- Ne jamais désactiver une protection de sécurité pour faciliter les tests.
- Ne pas affirmer qu'une fonctionnalité est « sécurisée » sans tests appropriés.
- Privilégier un code lisible, modulaire, documenté et testable.
- En cas d'incertitude importante, **documenter la question** plutôt qu'inventer une
  réponse.

## 9. Sécurité (aperçu)

Voir [`docs/security.md`](docs/security.md). Points clés :

- Principe du moindre privilège et séparation des rôles/permissions.
- Contrôle d'accès côté serveur pour **chaque** opération sensible.
- Journal d'audit des accès aux données médicales (sans données sensibles dans les logs).
- Chiffrement des communications, protection des secrets.
- Gestion des erreurs sans fuite d'information technique.
- Accès d'urgence encadré, justifié et audité.

## 10. Interopérabilité

Voir [`docs/architecture.md`](docs/architecture.md) et
[`docs/roadmap.md`](docs/roadmap.md). SahaTN est conçu pour intégrer
progressivement des systèmes existants. **Aucune API nationale, aucun identifiant
sanitaire ni base de données externe n'est supposé accessible.** Les standards
d'échange (notamment HL7 FHIR) seront évalués avant toute intégration.

Un référentiel de terminologie **interne** (signes vitaux + sous-ensemble UCUM) est
exposé en lecture seule via `GET /api/terminology/vital-signs`, `/units` et
`/observations`. Aucune nomenclature sous licence (CIM/ICD, LOINC, SNOMED CT) n'est
embarquée : voir [`docs/reference-data.md`](docs/reference-data.md).

## 11. Licence

Projet en cours d'initialisation. Licence à définir.
