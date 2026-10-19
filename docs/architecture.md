# Architecture — SahaTN

## 1. Vue d'ensemble

SahaTN est un **monolithe modulaire** organisé en deux applications déployables et une
base de données relationnelle :

```text
┌────────────────────┐        HTTPS/JSON        ┌─────────────────────────┐
│  Frontend (web)    │  ───────────────────────▶ │  Backend API (REST)     │
│  Next.js + React   │ ◀───────────────────────  │  NestJS + TypeScript    │
│  TypeScript        │                           │                         │
└────────────────────┘                           └────────────┬────────────┘
                                                              │ Prisma
                                                              ▼
                                                 ┌─────────────────────────┐
                                                 │  PostgreSQL             │
                                                 │  (données + audit)      │
                                                 └─────────────────────────┘
```

- **Frontend** : interface patient, professionnelle et administrative.
- **Backend API** : logique métier, autorisation, validation, audit. Toute décision de
  sécurité est prise **côté serveur**.
- **PostgreSQL** : persistance relationnelle, y compris le journal d'audit.

Aucun microservice n'est introduit au départ. Objectif : garder des **frontières de
domaines claires** (modules) dans un seul déployable, pour pouvoir extraire un service
plus tard si un besoin réel le justifie.

## 2. Pourquoi un monolithe modulaire (et non des microservices)

| Critère              | Monolithe modulaire           | Microservices (prématurés)         |
| -------------------- | ----------------------------- | ---------------------------------- |
| Complexité initiale  | Faible                        | Élevée (réseau, données, ops)      |
| Cohérence des données| Transactions locales simples  | Cohérence distribuée difficile     |
| Vitesse d'itération  | Élevée                        | Ralentie par l'infrastructure      |
| Frontières de domaine| Préparées, extractibles       | Déjà distribuées                   |
| Coût opérationnel    | Faible                        | Élevé (observabilité, orchestration)|

**Décision** : commencer par un monolithe modulaire. Voir
[ADR-0001](decisions/0001-monolithe-modulaire.md).

## 3. Responsabilités des composants

### 3.1 Frontend (Next.js + React + TypeScript)

- Rendu des interfaces patient / professionnel / admin.
- Appels à l'API backend ; **aucune logique d'autorisation sensible** côté client.
- Validation de formulaire pour le confort utilisateur (jamais la seule validation).
- Gestion de session via cookies sécurisés (httpOnly) et/ou jetons courts.

### 3.2 Backend API (NestJS + TypeScript)

- **Authentification et autorisation** (rôles + règles contextuelles).
- **Validation stricte** de toutes les entrées (DTO + pipe de validation).
- **Logique métier** par module de domaine.
- **Journalisation d'audit** des accès aux données médicales.
- Exposition d'une **API REST documentée** (OpenAPI/Swagger).

### 3.3 Base de données (PostgreSQL)

- Source de vérité relationnelle (patients, professionnels, établissements, etc.).
- **Journal d'audit** append-only (accès aux données médicales).
- Contraintes d'intégrité fortes (clés, unicité, contraintes de vérification).
- **Validation d'environnement** : les variables numériques (ex. `PORT`, `SESSION_TTL_SECONDS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `DOCUMENT_MAX_FILE_BYTES`) sont converties et validées de manière **explicite et stricte** (acceptation uniquement d'entiers numériques valides, sans conversion implicite globale des autres types) ; toute valeur invalide fait échouer le démarrage sans remplacement silencieux par une valeur par défaut.

### 3.4 Infrastructures transverses

- **Docker / Docker Compose** : environnement reproductible.
- **Journalisation** : accès et événements de sécurité, sans données sensibles.
- **Sauvegardes** : voir [`security.md`](security.md).

## 4. Structure backend (par domaines)

Le backend est organisé par **module métier**, chacun encapsulant contrôleurs,
services, DTO et accès aux données de son domaine :

```text
backend/src/
├── main.ts                 # Amorçage (sécurité, validation globale, port)
├── app.module.ts           # Agrégation des modules
├── config/                 # Configuration + validation des variables d'env
├── common/                 # Filtres, intercepteurs, guards transverses
└── modules/
    ├── health/             # Sonde de santé (implémenté au Jour 1)
    ├── auth/               # (implémenté au Jour 2) comptes de base, sessions, rôles
    ├── patients/           # (à venir) profils patients
    ├── doctors/            # (implémenté au Jour 3) profils médecins, qualifications, répertoire
    ├── specialties/        # (implémenté au Jour 3) référentiel des spécialités
    ├── terminology/        # référentiel interne (signes vitaux, unités UCUM), lecture seule
    ├── verification/       # (implémenté au Jour 3) workflow de vérification professionnelle
    ├── facilities/         # (implémenté au Jour 4) établissements, gestion, affiliations
    ├── catalog/            # (à venir) services (spécialités déjà couvertes)
    ├── appointments/       # (implémenté aux Jours 6-7) agendas, créneaux, rendez-vous
    ├── medical-records/    # (implémenté aux Jours 8-10) dossiers, contenu clinique, autorisations, documents
    ├── diagnostics/        # (à venir) laboratoires, analyses, imagerie
    ├── audit/              # (à venir) journal d'audit et détection
    ├── notifications/      # (implémenté au Jour 7) file de notifications (outbox)
    ├── admin/              # (à venir) administration, qualité des données
    └── fhir/               # (implémenté au Jour 11) adaptation et export FHIR R4 (prototype)
```

**Règles de frontières** :

- Un module ne lit/écrit que ses propres tables.
- La communication inter-modules passe par des **services publics** explicites, jamais
  par accès direct aux tables d'un autre module.
- Les dépendances entre modules sont unidirectionnelles et documentées.

## 5. Structure frontend

```text
frontend/
├── app/                    # App Router Next.js
│   ├── layout.tsx          # Layout racine (en-tête, pied, AuthProvider)
│   ├── page.tsx            # Page d'accueil (présentation + appels à l'action)
│   ├── login/page.tsx      # Connexion (Jour 2)
│   ├── register/page.tsx   # Inscription patient (Jour 2)
│   ├── search/page.tsx     # Recherche combinée médecins / établissements (Jour 4)
│   ├── doctors/            # Annuaire et fiche médecin (Jour 4)
│   ├── facilities/         # Annuaire, fiche et gestion d'établissement (Jours 4-11)
│   ├── dashboard/          # Espace connecté protégé (depuis le Jour 2)
│   │   ├── layout.tsx      # Coquille + navigation latérale selon les rôles
│   │   ├── page.tsx        # Tableau de bord
│   │   ├── appointments/   # Espace patient de rendez-vous (Jours 6-7)
│   │   ├── schedules/      # Écran praticien d'agenda (Jours 6-7)
│   │   ├── records/        # Dossier patient + détail consultation (Jour 8)
│   │   │   ├── access/     # Consentements, relations, journal d'accès (Jour 9)
│   │   │   └── documents/  # Documents médicaux du patient (Jour 10)
│   │   └── patients/       # Patients accessibles (praticien) (Jours 9-10)
│   └── globals.css         # Jetons de design + styles des composants (Jour 13)
├── components/             # Composants d'interface partagés (Jour 13)
│   ├── ui.tsx              # Bouton, carte, badge, alerte, champ, états, pagination…
│   ├── auth-context.tsx    # Contexte d'authentification (profil connecté)
│   ├── site-header.tsx     # En-tête global (navigation + authentification)
│   ├── site-footer.tsx     # Pied de page
│   └── confirm-dialog.tsx  # Boîte de confirmation accessible
├── lib/
│   ├── api.ts              # Client fetch (cookies + en-tête CSRF)
│   ├── types.ts            # Types de vue partagés
│   ├── nav.ts              # Navigation publique et par rôle
│   └── labels.ts           # Libellés français (gouvernorats, secteurs, types)
├── public/                 # Ressources statiques
├── next.config.mjs         # Proxy /api/* vers le backend (API_URL)
└── tsconfig.json
```

Le frontend ne détient **aucune** décision d'autorisation : il relaie les erreurs du
serveur. Les cookies de session sont gérés par le navigateur ; le client ajoute
automatiquement l'en-tête `x-csrf-token` lu dans le cookie `sahatn_csrf`. Les espaces
(patient, professionnel, admin) sont séparés par segments de route et protégés par des
contrôles d'accès côté serveur, renforcés côté client par une navigation adaptée aux rôles.
Voir [frontend-ux.md](frontend-ux.md) pour le détail du système de design et des composants.

Le Jour 13 introduit une couche d'interface partagée : des jetons de design
(`globals.css`), une bibliothèque de composants réutilisables (`components/ui.tsx`),
un en-tête/pied de page globaux et une coquille de tableau de bord avec navigation par
rôle. L'objectif est l'homogénéité visuelle, l'accessibilité (contrastes, focus visible,
libellés, cibles tactiles, `prefers-reduced-motion`) et le responsive (mobile ≥ 360 px,
tablette, bureau), sans modifier les contrats d'API ni les règles d'autorisation.

## 6. Modèle de données (aperçu)

Orthogonal aux modules, le schéma relationnel sera construit progressivement. Esquisse
de domaines (aucune donnée réelle) :

- **Identité** : comptes, rôles, permissions, sessions.
- **Patients** : profil, préférences, identifiants (à définir).
- **Professionnels** : profil pro, qualifications, statut de vérification.
- **Établissements** : structures, lieux, rattachements.
- **Référentiels** : spécialités, services, villes.
- **Planification** : agendas, créneaux, rendez-vous.
- **Clinique** : dossiers, consultations, observations, diagnostics, allergies (Jours 8-9).
- **Accès** : autorisations (consentements), relations de soin, accès d'urgence (Jour 9).
- **Documents** : pièces jointes médicales — métadonnées en base, contenu hors base (Jour 10).
- **Audit** : journal append-only des accès.
- **Notifications** : messages et états d'envoi.

### 6.1 Identité — implémenté au Jour 2

Premier domaine concret, volontairement minimal et sûr :

- `User` : identifiant `uuid`, `email` (unique, optionnel), `phone` (unique, optionnel),
  `passwordHash`, `status` (`UserStatus`), `failedLoginAttempts`, `lockedUntil`,
  `lastLoginAt`.
- `UserRole` : association `userId` + `role` (`PATIENT`, `DOCTOR`, `FACILITY_STAFF`,
  `ADMIN`), clé composite — un utilisateur peut cumuler des rôles.
- `Session` : `id` (`uuid`), `tokenHash` (unique), `expiresAt`, `revokedAt`, `lastUsedAt`,
  `userAgent`, `ipAddress`, liée à l'utilisateur.

Migration correspondante : `prisma/migrations/20261011131513_init_identity`.

**API exposée** (préfixe `/api`) :

| Méthode | Chemin                | Accès              | Rôle                                   |
| ------- | --------------------- | ------------------ | -------------------------------------- |
| `POST`  | `/auth/register`      | Public (throttlé)  | Créer un compte **patient** uniquement |
| `POST`  | `/auth/login`         | Public (throttlé)  | Ouvrir une session                     |
| `POST`  | `/auth/logout`        | Session + CSRF     | Révoquer la session courante           |
| `GET`   | `/auth/me`            | Session            | Profil non sensible de l'utilisateur   |

L'inscription publique ne permet **pas** de s'attribuer un rôle privilégié
(`DOCTOR`, `FACILITY_STAFF`, `ADMIN`) : toute tentative est rejetée (`400`). Les
comptes privilégiés sont créés hors parcours public (script `create-admin`), et le rôle
`DOCTOR` est attribué **par l'administration**, via le workflow de vérification (Jour 3).
Détails de sécurité : [ADR-0008](decisions/0008-sessions-et-csrf.md),
[ADR-0009](decisions/0009-anti-force-brute.md).

### 6.2 Espaces professionnels et vérification — implémenté au Jour 3

Second domaine concret (migration `add_doctor_verification`) :

- `Specialty` : référentiel — `code` (unique), `labelFr`, `labelAr`, `isActive`.
- `DoctorProfile` : `userId` (unique), `displayName`, `professionalDescription`,
  `languages`, `yearsOfExperience`, `verificationStatus`, `isPubliclyListed`.
- `DoctorSpecialty` : associations profil ↔ spécialité (clé composite, `isPrimary`).
- `ProfessionalCredential` : déclarations de qualification en **métadonnées** (type,
  autorité émettrice, référence, date) — aucun document justificatif stocké à ce stade.
- `DoctorVerificationRequest` : `status` (`DRAFT`, `PENDING`, `UNDER_REVIEW`,
  `APPROVED`, `REJECTED`, `NEEDS_CORRECTION`), `activeForDoctorId` (une seule demande
  ouverte à la fois), `reviewerId`, `decisionReason`, dates.
- `DoctorVerificationChecklist` : liste de contrôle liée à la demande.
- `DoctorVerificationEvent` : journal d'audit **append-only** des actions
  (`CREATED`, `SUBMITTED`, `REVIEW_STARTED`, `CORRECTION_REQUESTED`, `RESUBMITTED`,
  `APPROVED`, `REJECTED`, `REVOKED`).

**API exposée** (préfixe `/api`) :

| Méthode | Chemin                                                    | Accès               | Rôle                                    |
| ------- | --------------------------------------------------------- | ------------------- | --------------------------------------- |
| `GET`   | `/specialties`                                            | Public              | Référentiel actif                       |
| `POST`  | `/specialties`                                            | Session + CSRF      | Admin                                   |
| `PATCH` | `/specialties/:id`                                        | Session + CSRF      | Admin                                   |
| `GET`   | `/terminology/vital-signs`                                | Public              | Référentiel interne (signes vitaux)     |
| `GET`   | `/terminology/units`                                      | Public              | Sous-ensemble UCUM                      |
| `GET`   | `/terminology/observations`                               | Public              | Catalogue d'observations (interne)      |
| `GET`   | `/doctors/me`                                             | Session             | Propriétaire                            |
| `PUT`   | `/doctors/me`                                             | Session + CSRF      | Propriétaire                            |
| `GET`   | `/doctors/me/credentials`                                 | Session             | Propriétaire                            |
| `POST`  | `/doctors/me/credentials`                                 | Session + CSRF      | Propriétaire                            |
| `PUT`   | `/doctors/me/visibility`                                  | Session + CSRF      | Propriétaire (vérifié requis)           |
| `POST`  | `/doctors/me/verification`                                | Session + CSRF      | Propriétaire                            |
| `GET`   | `/doctors/me/verification`                                | Session             | Propriétaire                            |
| `GET`   | `/admin/doctor-verifications`                             | Session             | Admin                                   |
| `GET`   | `/admin/doctor-verifications/:id`                         | Session             | Admin                                   |
| `POST`  | `/admin/doctor-verifications/:id/decision`                | Session + CSRF      | Admin (jamais le demandeur lui-même)    |
| `GET`   | `/doctors/:id`                                            | Public              | Profil vérifié et publié uniquement     |

Décisions possibles sur une demande : `START_REVIEW`, `REQUEST_CORRECTION`, `APPROVE`,
`REJECT`, `REVOKE` — bornées par une **machine à états** et journalisées.

### 6.3 Agendas, rendez-vous et notifications — implémenté aux Jours 6-7

Migration `add_appointment_reliability` (migration `add_appointments` au Jour 6) :

- `AppointmentSchedule` : agenda d'une affiliation — `timezone`,
  `visitDurationMinutes`, `confirmationMode` (`AUTOMATIC`/`MANUAL`/`DISABLED`),
  `status`, `requiresConfirmation` (dérivé, conservé pour compatibilité).
- `AppointmentSlot` : créneau (`startsAt`, `endsAt`, `status`) rattaché à un agenda.
- `Appointment` : rendez-vous — `status`, `reason`, `idempotencyKey` (réservation
  rejouable), `requiresConfirmation`, lié au créneau et au patient.
- `AppointmentEvent` / `AppointmentScheduleEvent` : journaux d'audit **append-only** des
  transitions de rendez-vous et des modifications d'agenda.
- `NotificationOutbox` : file persistée des notifications (`type`, `channel`, `status`,
  `dedupeKey` unique, `payload` JSON), découplée du domaine des rendez-vous.

**Règles clés** :
- Réservation patient **idempotente** ; un créneau déjà réservé est refusé.
- Confirmation `AUTOMATIC` (immédiate), `MANUAL` (décision praticien) ou `DISABLED`
  (réservation refusée par `409`).
- Décisions praticien (`CONFIRM`, `REJECT`, `COMPLETE`, `NO_SHOW`) bornées par une machine
  à états ; motif requis pour un refus ; gestionnaires d'établissement autorisés pour leurs
  affiliations.
- **Audit scellé en base** : fonction `sahatn_audit_append_only` + déclencheurs
  `BEFORE UPDATE OR DELETE` sur les tables d'événements (rendez-vous, agenda,
  vérifications médecin et établissement).
- **Notifications découplées** : service `enqueue` (déduplication par `dedupeKey`) et
  interface `NotificationChannelAdapter` ; l'adaptateur **Noop** marque les envois
  `SKIPPED` et ne prétend **jamais** les avoir envoyés. Les charges utiles n'exposent pas
  le motif libre du patient.

**API exposée** (préfixe `/api`) :

| Méthode  | Chemin                                                   | Accès           | Rôle                                  |
| -------- | -------------------------------------------------------- | --------------- | ------------------------------------- |
| `GET`    | `/appointments/schedules/:affiliationId`                 | Session         | Praticien / gestionnaire propriétaire |
| `PUT`    | `/appointments/schedules/:affiliationId`                 | Session + CSRF  | Praticien / gestionnaire propriétaire |
| `POST`   | `/appointments/schedules/:scheduleId/slots/generate`     | Session + CSRF  | Praticien propriétaire                |
| `DELETE` | `/appointments/schedules/:scheduleId/slots/:slotId`      | Session + CSRF  | Praticien propriétaire                |
| `GET`    | `/appointments/schedules/:scheduleId/appointments`       | Session         | Praticien propriétaire                |
| `GET`    | `/appointments/schedules/:scheduleId/availability`       | Public          | Créneaux ouverts et futurs            |
| `POST`   | `/appointments`                                          | Session + CSRF  | Patient (idempotent)                  |
| `GET`    | `/appointments/me`                                       | Session         | Patient                               |
| `GET`    | `/appointments/:id`                                      | Session         | Patient / praticien / admin           |
| `POST`   | `/appointments/:id/cancel`                               | Session + CSRF  | Patient                               |
| `POST`   | `/appointments/:id/decide`                               | Session + CSRF  | Praticien / gestionnaire              |
| `GET`    | `/notifications/me`                                      | Session         | Propriétaire                          |
| `GET`    | `/admin/notifications`                                   | Session         | Admin                                 |
| `POST`   | `/admin/notifications/dispatch`                          | Session + CSRF  | Admin                                 |

### 6.4 Dossiers médicaux, autorisations et accès d'urgence — implémenté aux Jours 8-9

Le module `medical-records` regroupe le **contenu clinique** (Jour 8) et le **moteur
d'autorisation** (Jour 9). Migrations correspondantes : `add_medical_records` (Jour 8) et
`add_access_and_consent` (Jour 9).

- `MedicalRecord` : dossier médical **longitudinal** d'un patient (unique par patient) ;
  ancêtre des consultations et du contenu clinique.
- `ClinicalEncounter` : consultation clinique (praticien, établissement optionnel, dates,
  motif) rattachée à un dossier.
- `ClinicalObservation`, `ClinicalDiagnosis`, `PatientAllergy` : contenu clinique structuré
  (observations catégorisées, diagnostics, allergies).
- `MedicalRecordAccessEvent` : journal **append-only** des accès (action, base d'accès,
  code de raison borné).
- `CareRelationship` : relation de soin (statut, source `APPOINTMENT`/`PATIENT_GRANT`/
  `SYSTEM`) — projection **informative**, jamais une clé d'accès.
- `MedicalRecordGrant` + `MedicalRecordGrantEvent` : **consentement** explicite et granulaire
  du patient (permissions de lecture/écriture, fenêtre de validité, cycle de vie
  `ACTIVE`/`REVOKED` journalisé).
- `EmergencyAccessGrant` : fenêtre d'**accès d'urgence** en lecture seule (justification
  obligatoire, expiration, statut).

**Règles clés** :
- L'accès à un dossier exige une **base explicite** : autorisation active du patient, ou
  urgence encadrée. Rôle, affiliation et rendez-vous passé sont **insuffisants**.
- Les **écritures** exigent toujours une autorisation explicite ; **aucun repli d'urgence**.
- Le moteur `RecordAccessService` est **unique** : les couches métier y délèguent leur
  décision d'accès ; tout refus est audité (`ACCESS_DENIED`) et renvoyé de façon générique.
- L'urgence est **lecture seule**, bornée à **24 h**, justifiée, auditée et **notifiée au
  patient**.
- L'**immuabilité** est scellée en base : fonction `sahatn_clinical_no_delete` + déclencheurs
  `BEFORE DELETE` (dossiers, consultations, relations, autorisations) et `BEFORE UPDATE OR
  DELETE` sur le journal d'accès.

Voir [ADR-0012](decisions/0012-acces-consentement-urgence.md).

**API exposée** (préfixe `/api`) :

| Méthode | Chemin                                                                    | Accès          | Rôle                                    |
| ------- | ------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| `GET`   | `/medical-records/me`                                                     | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/encounters`                                          | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/encounters/:encounterId`                             | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/diagnoses`                                           | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/allergies`                                           | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/grants`                                              | Session        | Patient (propriétaire)                  |
| `POST`  | `/medical-records/me/grants`                                              | Session + CSRF | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/grants/history`                                      | Session        | Patient (propriétaire)                  |
| `POST`  | `/medical-records/me/grants/:grantId/revoke`                              | Session + CSRF | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/relations`                                           | Session        | Patient (propriétaire)                  |
| `POST`  | `/medical-records/me/relations/:relationId/end`                           | Session + CSRF | Patient (propriétaire)                  |
| `GET`   | `/medical-records/me/access`                                              | Session        | Patient (propriétaire — journal d'accès)|
| `GET`   | `/medical-records/me/emergency-access`                                    | Session        | Patient (propriétaire)                  |
| `GET`   | `/medical-records/patients`                                               | Session        | Praticien (dossiers autorisés)          |
| `GET`   | `/medical-records/patients/:patientUserId/access`                         | Session        | Praticien (statut d'accès)              |
| `GET`   | `/medical-records/patients/:patientUserId`                                | Session        | Praticien autorisé                      |
| `GET`   | `/medical-records/patients/:patientUserId/encounters`                     | Session        | Praticien autorisé                      |
| `GET`   | `/medical-records/patients/:patientUserId/encounters/:encounterId`        | Session        | Praticien autorisé                      |
| `GET`   | `/medical-records/patients/:patientUserId/observations`                   | Session        | Praticien autorisé                      |
| `GET`   | `/medical-records/patients/:patientUserId/diagnoses`                      | Session        | Praticien autorisé                      |
| `GET`   | `/medical-records/patients/:patientUserId/allergies`                      | Session        | Praticien autorisé                      |
| `POST`  | `/medical-records/patients/:patientUserId/encounters`                     | Session + CSRF | Praticien (autorisation d'écriture)     |
| `POST`  | `/medical-records/patients/:patientUserId/encounters/:encounterId/observations` | Session + CSRF | Praticien (autorisation d'écriture) |
| `POST`  | `/medical-records/patients/:patientUserId/diagnoses`                      | Session + CSRF | Praticien (autorisation d'écriture)     |
| `POST`  | `/medical-records/patients/:patientUserId/allergies`                      | Session + CSRF | Praticien (autorisation d'écriture)     |
| `POST`  | `/medical-records/patients/:patientUserId/emergency-access`               | Session + CSRF | Praticien vérifié (accès d'urgence)     |

### 6.5 Documents médicaux — implémenté au Jour 10

Migration `add_medical_documents`. Les documents sont des **pièces jointes** (PDF, PNG,
JPEG, WEBP) : leurs **métadonnées** vivent en base, leur **contenu binaire hors base** dans
un stockage privé abstrait (`MedicalDocumentStorage`, implémentation locale en développement).

- `MedicalDocument` : `category` (`LAB_RESULT`, `IMAGING`, `REPORT`, `PRESCRIPTION`,
  `OTHER`), `originalName`, `storageKey` (**générée par le serveur**, jamais exposée),
  `declaredMimeType`, `detectedMimeType` (déduit des octets), `sizeBytes`, `checksumSha256`,
  `status` (`ACTIVE`/`ARCHIVED`), auteur (`uploadedByUserId`, `uploaderDoctorProfileId`
  optionnel), rattachement optionnel à une consultation, archivage (`archivedAt`,
  `archivedByUserId`, `archiveReason`).
- Nouvelles permissions de consentement : `VIEW_DOCUMENTS`, `WRITE_DOCUMENTS`.
- Nouvelles actions d'audit : `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`,
  `DOCUMENT_ARCHIVED`, `DOCUMENT_REJECTED`.

**Règles clés** :
- **Autorisation déléguée** au moteur `RecordAccessService` : lecture sous `VIEW_DOCUMENTS`
  (ou accès d'urgence en **lecture seule**), dépôt/archivage sous `WRITE_DOCUMENTS`
  (jamais l'urgence) ; le patient accède toujours à ses propres documents.
- **Validation du contenu** par *magic bytes* (type déclaré/extensions incohérents refusés),
  taille bornée (`DOCUMENT_MAX_FILE_BYTES`, 5 Mo par défaut), dépôt refusé audité.
- **Intégrité** : empreinte SHA-256 calculée au dépôt et re-vérifiée à chaque téléchargement.
- **Stockage privé** : clé serveur (`documents/AAAA/MM/<uuid>`), rejet de toute clé hors
  racine (traversée de répertoire), permissions restreintes, aucune URL publique.
- **Archivage logique** uniquement ; déclencheur `BEFORE DELETE`
  (`MedicalDocument_no_silent_delete`) contre la suppression silencieuse.

Voir [ADR-0013](decisions/0013-stockage-documents-medicaux.md).

**API exposée** (préfixe `/api`) :

| Méthode | Chemin                                                                          | Accès          | Rôle                                   |
| ------- | ------------------------------------------------------------------------------- | -------------- | -------------------------------------- |
| `GET`   | `/medical-records/me/documents`                                                 | Session        | Patient (propriétaire)                 |
| `GET`   | `/medical-records/me/documents/:documentId`                                     | Session        | Patient (propriétaire)                 |
| `GET`   | `/medical-records/me/documents/:documentId/content`                             | Session        | Patient (propriétaire — téléchargement)|
| `POST`  | `/medical-records/me/documents`                                                 | Session + CSRF | Patient (dépôt, multipart)             |
| `POST`  | `/medical-records/me/documents/:documentId/archive`                             | Session + CSRF | Patient (archivage)                    |
| `GET`   | `/medical-records/patients/:patientUserId/documents`                            | Session        | Praticien autorisé (`VIEW_DOCUMENTS`)  |
| `GET`   | `/medical-records/patients/:patientUserId/documents/:documentId`                | Session        | Praticien autorisé (`VIEW_DOCUMENTS`)  |
| `GET`   | `/medical-records/patients/:patientUserId/documents/:documentId/content`        | Session        | Praticien autorisé (téléchargement)    |
| `POST`  | `/medical-records/patients/:patientUserId/documents`                            | Session + CSRF | Praticien (`WRITE_DOCUMENTS`, multipart)|
| `POST`  | `/medical-records/patients/:patientUserId/documents/:documentId/archive`        | Session + CSRF | Praticien (`WRITE_DOCUMENTS`)          |

## 7. Sécurité architecturale

- Autorisation **côté serveur** systématique (`guards` NestJS + règles de domaine).
- Le modèle RBAC est complété par des règles **contextuelles** : l'accès à un dossier
  médical exige une **base explicite** (consentement du patient ou urgence encadrée) ; le
  rôle, l'affiliation et le rendez-vous passé ne suffisent jamais. Détail dans
  [`security.md`](security.md) et [ADR-0012](decisions/0012-acces-consentement-urgence.md).
- Toute lecture/écriture de donnée médicale déclenche un **événement d'audit**.
- Les **documents médicaux** réutilisent la même base d'accès explicite ; leur contenu est
  stocké **hors base** dans un espace privé, jamais servi sans autorisation, avec type et
  taille bornés, intégrité vérifiée et clé de stockage non exposée
  ([ADR-0013](decisions/0013-stockage-documents-medicaux.md)).
- Gestion centralisée des erreurs sans fuite d'information technique.

## 8. Tests

| Niveau       | Objectif                                              | Outils                  |
| ------------ | ----------------------------------------------------- | ----------------------- |
| Unitaires    | Logique métier et règles d'autorisation isolées       | Jest                    |
| Intégration  | Modules + base de données (PostgreSQL de test)        | Jest + Supertest        |
| E2E          | Parcours critiques de bout en bout                    | Playwright (Chromium)   |
| Accessibilité| Contrastes, libellés, rôles, structure (WCAG 2.1 A/AA)| axe-core (via Playwright) |

Les tests de sécurité (contrôle d'accès, audit) sont traités comme des tests de premier
ordre, pas comme des ajouts tardifs.

**Intégration continue (Jour 16)** : un workflow GitHub Actions
([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) exécute, sur runners séparés,
les contrôles backend (lint, typecheck, build, validation d'environnement, tests unitaires
et e2e sur un service PostgreSQL isolé) et frontend (lint, typecheck, build de production,
tests Playwright + axe-core sur Chromium). Détail, commandes locales et diagnostic :
[`ci.md`](ci.md).

## 9. Déploiement

- **Développement** : Docker Compose (PostgreSQL + backend + frontend).
- **CI/CD** : intégration continue en place (lint, typecheck, tests, build — voir §8 et
  [`ci.md`](ci.md)) ; déploiement automatisé non configuré.
- **Sauvegardes** : voir [`security.md`](security.md).
- **Production** : conteneurs, secrets gérés hors dépôt, chiffrement des communications,
  sauvegardes protégées. Hébergement à valider selon le cadre juridique tunisien
  (voir [`roadmap.md`](roadmap.md)).

## 10. Interopérabilité (prototype d'export FHIR R4 — Jour 11)

- Approche par **adaptateurs** dans le module `fhir` : une **source neutre**
  (`FhirExportSource`, découplée des modèles) est projetée par des **convertisseurs purs**
  par ressource, derrière un **port** `InteroperabilityAdapter`
  (jeton `INTEROPERABILITY_ADAPTER`) implémenté par `FhirR4Adapter`. Le cœur du domaine
  reste **indépendant du format FHIR**.
- Cible : **HL7 FHIR R4 (4.0.1)** (`https://hl7.org/fhir/R4`). Ressources projetées :
  Patient, Practitioner, Organization, Encounter, Observation, Condition,
  AllergyIntolerance, DocumentReference, Provenance (pas d'`AuditEvent` dans les bundles
  cliniques).
- **Export en lecture seule uniquement** : `GET /api/fhir/demo/bundle` (jeu **fictif**
  entièrement déterministe, horodatage figé), `GET /api/fhir/me/bundle` (patient),
  `GET /api/fhir/patients/:patientUserId/bundle` (praticien **autorisé**). Bundle de type
  `collection`. **Aucune** intégration réseau, serveur FHIR ou import/écriture.
- **Contenu déterministe** : à données et contexte d'autorisation identiques, les ressources
  et leur ordre sont stables (tri explicite) ; pour les exports réels, seul le `timestamp`
  du Bundle reflète l'instant de génération.
- **Stratégie d'identifiants** : identifiants internes exposés sous un système local
  `urn:sahatn:identifier:*` ; email/téléphone en `telecom` ; jamais présentés comme
  identifiant sanitaire national (inconnu).
- **Terminologies** : systèmes standards (v3-ActCode, observation-category,
  condition-clinical, condition-ver-status, allergyintolerance-clinical, data-absent-reason).
  Aucune terminologie nationale inventée.
- **Autorisation et audit** réutilisent le moteur Jour 9 (granulaire par section, urgence en
  lecture seule) ; l'export **accepté est journalisé** (`RECORD_VIEWED`, cible `FhirExport`) et
  le **refus audité** (`ACCESS_DENIED`), sans donnée clinique. **Double validation** : règles
  SahaTN (`validateFhirBundle`) et **schéma JSON officiel HL7 FHIR R4** archivé
  (`validateFhirBundleAgainstSchema`). Voir
  [ADR-0014](decisions/0014-prototype-fhir-r4.md).
- **Aucune intégration réelle** avec un système national/partenaire n'est supposée
  disponible : chaque raccordement devra être confirmé, doté de profils/terminologies
  retenus et autorisé juridiquement.

## 11. État actuel (Jours 8-13)

- Documentation d'architecture (ce fichier), sécurité, vision, roadmap et ADR.
- Backend NestJS avec sonde `/api/health`, configuration validée, sécurité HTTP de base.
- **Identité** : inscription patient, connexion, déconnexion, `/auth/me`, sessions en base,
  protection CSRF, vérification d'origine, rôles, anti-force brute (Jour 2).
- **Professionnels et vérification** (Jour 3), **établissements et affiliations**
  (Jour 4), **recherche combinée** (Jour 5).
- **Agendas, rendez-vous et notifications** : agendas de consultation, créneaux,
  disponibilités publiques, réservation idempotente, annulation, décisions praticien, mode
  de confirmation, audit append-only scellé en base et file de notifications découplée
  (Jours 6-7).
- **Dossiers médicaux et contenu clinique** : dossier longitudinal, consultations,
  observations, diagnostics, allergies ; API patient et praticien ; audit systématique et
  immuabilité scellée en base (Jour 8).
- **Autorisations, consentement et accès d'urgence** : moteur d'autorisation unique,
  consentement granulaire et révocable, relation de soin informative, accès d'urgence
  *break-glass* (lecture seule, 24 h, justifié, audité, notifié), refus audités et message
  générique (Jour 9).
- **Documents médicaux** : métadonnées en base, contenu binaire hors base dans un stockage
  privé abstrait, catégories, validation par contenu (PDF/PNG/JPEG/WEBP, taille bornée),
  intégrité SHA-256 re-vérifiée au téléchargement, autorisation déléguée au moteur
  (`VIEW_DOCUMENTS`/`WRITE_DOCUMENTS`, urgence en lecture seule), archivage logique et
  suppression scellée en base (Jour 10).
- **Interopérabilité FHIR R4 (prototype)** : module `fhir` avec port `InteroperabilityAdapter`
  et adaptateur `FhirR4Adapter`, export en lecture seule de bundles `collection`
  déterministes (démo fictive, patient, praticien autorisé), identifiants locaux
  `urn:sahatn:identifier:*`, terminologies standards uniquement, **double validation**
  (règles SahaTN + schéma JSON officiel FHIR R4) et **audit des exports acceptés/refusés** ;
  aucune intégration réseau (Jour 11).
- Frontend Next.js : accueil, inscription, connexion, tableau de bord, répertoires
  médecins/établissements, recherche, espace patient de rendez-vous, écran praticien
  d'agenda, dossier patient et détail de consultation, gestion des consentements et du
  journal d'accès, patients accessibles côté praticien, documents médicaux patient et
  praticien.
- **Interface professionnalisée (Jour 13)** : jetons de design (palette bleu profond /
  turquoise, échelles d'espacement, rayons, ombres), bibliothèque de composants partagés
  (`components/ui.tsx`), en-tête et pied de page globaux, coquille de tableau de bord avec
  navigation latérale adaptée au rôle, contexte d'authentification unique, boîte de
  confirmation accessible (remplace `window.confirm/prompt`), libellés français centralisés
  et responsive (mobile ≥ 360 px, tablette, bureau) avec focus visible, contrastes et
  `prefers-reduced-motion`. Aucune modification des contrats d'API ni des règles
  d'autorisation.
- `docker-compose.yml`, `.env.example` et migrations Prisma.
- Tests : unitaires (services/guards) et e2e par domaine (voir §8) — **147 unitaires /
  112 e2e**.
- **Non implémenté** : comptes rendus/ordonnances structurés, antivirus et chiffrement au
  repos du contenu, stockage objet privé (S3-compatible), profil patient détaillé, livraison
  réelle des notifications (adaptateur Noop), MFA, planification des rappels, revue a
  posteriori des accès d'urgence et tableau de bord d'audit (Phase 7). **Connecteurs FHIR
  réels** (serveur, import/écriture, profils et terminologies institutionnels) : voir
  [ADR-0014](decisions/0014-prototype-fhir-r4.md).

## 12. Décisions liées

- [ADR-0001 — Monolithe modulaire](decisions/0001-monolithe-modulaire.md)
- [ADR-0002 — Stack NestJS + Prisma + PostgreSQL](decisions/0002-nestjs-prisma-postgresql.md)
- [ADR-0003 — Validation stricte côté serveur](decisions/0003-validation-stricte.md)
- [ADR-0004 — Autorisation contextuelle pour les données médicales](decisions/0004-autorisation-contextuelle.md)
- [ADR-0005 — Stratégie de tests](decisions/0005-strategie-de-tests.md)
- [ADR-0006 — Interopérabilité FHIR à évaluer](decisions/0006-interoperabilite-fhir.md)
- [ADR-0007 — Données fictives uniquement](decisions/0007-donnees-fictives.md)
- [ADR-0008 — Sessions opaques en base et protection CSRF](decisions/0008-sessions-et-csrf.md)
- [ADR-0009 — Anti-force brute et limitation de débit](decisions/0009-anti-force-brute.md)
- [ADR-0010 — Répertoire des établissements et affiliations](decisions/0010-repertoire-etablissements.md)
- [ADR-0011 — Fiabilité des rendez-vous, audit append-only et notifications](decisions/0011-fiabilite-rendez-vous.md)
- [ADR-0012 — Accès explicite aux dossiers médicaux, consentement et accès d'urgence](decisions/0012-acces-consentement-urgence.md)
- [ADR-0013 — Stockage privé et accès contrôlé des documents médicaux](decisions/0013-stockage-documents-medicaux.md)
- [ADR-0014 — Prototype d'export FHIR R4 en lecture seule](decisions/0014-prototype-fhir-r4.md)
