# ADR-0012 — Accès explicite aux dossiers médicaux, consentement et accès d'urgence

- **Statut** : Accepté
- **Date** : Jour 9

## Contexte

Les Phases 4 et 5 ouvrent le cœur sensible du produit : le **dossier médical**. Jusqu'ici,
les rendez-vous et les vérifications professionnelles étaient encadrés, mais aucune donnée
clinique n'était exposée. Il fallait d'abord poser le contenu clinique (dossiers,
consultations, observations, diagnostics, allergies), puis — impérativement avant toute
mise à disposition — construire un **moteur d'autorisation** qui ne se contente pas du rôle.

Le [principe fondateur](../security.md) est explicite : *une authentification réussie ne
suffit jamais à autoriser l'accès à un dossier médical*. Le rôle `DOCTOR`, une affiliation
à un établissement, ou même un rendez-vous passé ne doivent **jamais** être considérés
comme une base d'accès suffisante. L'accès doit reposer sur une **base explicite** :

- le **consentement** du patient (autorisation expresse, granulaire, révocable) ;
- ou une **situation d'urgence** strictement encadrée (*break-glass*).

Le [ADR-0004](0004-autorisation-contextuelle.md) avait posé le principe et annoncé un
« moteur de règles d'autorisation testable » ; cette décision le concrétise.

## Décision

### 1. Contenu clinique (Phase 4 — Jour 8)

Dossiers longitudinaux par patient et contenu clinique structuré : `MedicalRecord`,
`ClinicalEncounter`, `ClinicalObservation`, `ClinicalDiagnosis`, `PatientAllergy`. Chaque
lecture/écriture est **systématiquement auditée**.

### 2. Un seul moteur d'autorisation (`RecordAccessService`)

Aucune couche métier ne décide elle-même de l'accès : les contrôleurs et services
cliniques délèguent à un **moteur unique**, testable de façon isolée.

- Un accès en **lecture** est autorisé par (`RecordAccessBasis`) :
  - `EXPLICIT_GRANT` : une autorisation active du patient couvrant la permission demandée ;
  - `EMERGENCY` : une fenêtre d'urgence active (lecture seule).
- Un accès en **écriture** exige **toujours** une autorisation explicite : **pas de
  repli d'urgence** (l'urgence ne permet que la consultation).
- Permissions granulaires : lecture —
  `VIEW_RECORD`, `VIEW_ENCOUNTERS`, `VIEW_OBSERVATIONS`, `VIEW_DIAGNOSES`,
  `VIEW_ALLERGIES` ; écriture — `WRITE_ENCOUNTERS`, `WRITE_OBSERVATIONS`,
  `WRITE_DIAGNOSES`, `WRITE_ALLERGIES`.

### 3. Consentement = base d'accès

`MedicalRecordGrant` porte l'autorisation : un praticien **vérifié** ne peut obtenir une
autorisation que pour un patient qui la lui accorde. Une autorisation couple
`permissions` + `effectiveFrom` + `expiresAt` (optionnel) et possède un **cycle de vie**
(`ACTIVE` → `REVOKED`) journalisé (`MedicalRecordGrantEvent`, append-only). Les créations,
révocations et expirations sont auditées. Une autorisation ne peut pas être créée avec une
date d'expiration déjà dépassée.

### 4. `CareRelationship` : projection informative, jamais une clé d'accès

La relation de soin (`CareRelationship`) est dérivée d'un rendez-vous confirmé/terminé, ou
d'un consentement. Elle sert à **informer** (`patientsWithAccess`, vue praticien) et
alimente le journal, mais **ne donne jamais** accès à un dossier. Mettre fin à une relation
n'annule pas une autorisation explicite — ce sont deux décisions distinctes.

### 5. Accès d'urgence (*break-glass*)

`EmergencyAccessGrant` ouvre une fenêtre en **lecture seule**, à durée limitée
(`EMERGENCY_ACCESS_TTL_MS` = 24 h), avec :

- **justification obligatoire** (longueur minimale) ;
- **traçabilité renforcée** : activation et expiration auditées
  (`EMERGENCY_ACCESS_GRANTED` / `EMERGENCY_ACCESS_EXPIRED`) ;
- **notification du patient** via la file de notifications.

### 6. Refus audités, message générique

Tout refus est journalisé (`ACCESS_DENIED`) avec un **code de raison borné**
(`AccessDenialReason` : `unverified_profile`, `no_authorization`, `authorization_revoked`,
`authorization_expired`, `authorization_not_effective`, `permission_denied`). Le client ne
reçoit qu'un message **générique** (`RECORD_ACCESS_DENIED_MESSAGE`), sans révéler
l'existence d'un dossier ni la nature exacte du refus.

### 7. Audit append-only scellé en base

Les journaux d'accès (`MedicalRecordAccessEvent`) et les événements d'autorisation sont
protégés par des déclencheurs `BEFORE UPDATE OR DELETE` (fonction
`sahatn_clinical_no_delete`) et `BEFORE DELETE` sur les tables cliniques et d'autorisation
(pas de suppression silencieuse d'un dossier, d'une relation ou d'une autorisation).

## Conséquences

**Avantages**
- Le principe « pas d'accès sans base explicite » est **implémenté et testé** : rôle,
  affiliation et rendez-vous passé ne suffisent jamais (test négatif explicite).
- Un unique moteur d'autorisation, isolé, rend les règles **testables** et évite la
  divergence entre contrôleurs.
- Consentement granulaire et révocable ; urgence **lecture seule**, bornée et notifiée ;
  toute tentative d'accès hors contexte est **refusée et auditée**.
- Immuabilité des journaux garantie **au niveau base**, indépendamment du code applicatif.

**Limites**
- L'accès d'urgence est borné dans le temps (24 h) mais **pas encore** soumis à une revue
  a posteriori outillée ni à une alerte administrateur (Phase 7).
- Le moteur ne gère pas encore les **délégations** (représentant légal, tuteur) ni le
  **consentement implicite** ; seule l'autorisation explicite et l'urgence sont couvertes.
- Les durées de conservation et le cadre juridique de l'accès d'urgence restent **à
  valider** avec les autorités de santé.

**Suites**
- Revue a posteriori des accès d'urgence et tableau de bord d'audit (Phase 7).
- Délégations et consentement de représentants ; préférences de communication.
- Chiffrement au repos des données médicales et politique de conservation.

## Références

- Modèles et migration : `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/20261011230000_add_access_and_consent/`,
  `backend/prisma/migrations/20261011220000_add_medical_records/`
- Moteur d'autorisation : `backend/src/modules/medical-records/record-access.service.ts`
- Service clinique et contrôleurs : `backend/src/modules/medical-records/`
- Tests : `backend/src/modules/medical-records/record-access.service.spec.ts`,
  `backend/test/medical-records.e2e-spec.ts`
- Principe d'origine : [ADR-0004](0004-autorisation-contextuelle.md)
