# Feuille de route — SahaTN

Cette feuille de route ordonne le développement. Elle est volontairement prudente : on
consolide les fondations avant d'ouvrir des modules sensibles. Chaque phase sépare :

- **Fonctionnalités prévues**
- **Dépendances techniques**
- **Risques à traiter**
- **Validations juridiques / institutionnelles requises**

---

## Phase 0 — Fondations (terminée — Jour 1)

**Fonctionnalités prévues**
- Documentation d'architecture, sécurité, vision, roadmap.
- Décisions d'architecture (ADR).
- Squelette backend (NestJS) : amorçage, configuration validée, sonde `/api/health`.
- Squelette frontend (Next.js + TypeScript).
- Environnement Docker reproductible.

**Dépendances techniques**
- Node.js 20 LTS, Docker.
- Choix d'outil de tests (Jest côté backend).
- Mise en place CI (lint + typecheck + tests) — à faire.

**Risques à traiter**
- Dérive de périmètre (vouloir tout développer trop tôt).
- Absence de tests dès le départ.

**Validations juridiques / institutionnelles**
- Aucune à ce stade.

**Critère de sortie** : documentation validée ; squelette qui démarre ; aucun module
métier sensible activé.

---

## Phase 1 — Identité et authentification (terminée — Jour 2)

**Réalisé (Jour 2)**
- Modèles Prisma : `User`, `UserRole`, `Session` (migration `init_identity`).
- Inscription **patient**, connexion, déconnexion, `GET /auth/me`.
- Hachage Argon2id ; sessions opaques en base (révocables) ; cookies `HttpOnly`/
  `SameSite` ; protection CSRF et vérification d'origine.
- Rôles (`PATIENT`, `DOCTOR`, `FACILITY_STAFF`, `ADMIN`) avec garde de rôles ; refus de
  l'auto-attribution d'un rôle privilégié à l'inscription.
- Anti-force brute (verrouillage de compte) et limitation de débit.
- Tests unitaires (services, `RolesGuard`) et e2e d'authentification (parcours + sécurité).
- Pages frontend : inscription, connexion, tableau de bord protégé.

**Reste à faire**
- MFA pour les comptes professionnels/administratifs.
- Rotation de jeton de session ; création de comptes non-patients hors parcours public.
- Consentement / politique de confidentialité (interface).

**Risques à traiter**
- Gestion des secrets, rotation des jetons.
- Politique de mot de passe renforcée (listes de mots de passe compromis).

**Validations juridiques / institutionnelles**
- Politique de confidentialité et conditions d'utilisation.
- Base légale du traitement des données d'identité.

**Critère de sortie** : inscription/connexion fonctionnelles et testées ; contrôle
d'accès par rôle vérifié par tests. — *Atteint (Jour 2)*.

---

## Phase 2 — Patients, professionnels, établissements, référentiels (en cours — Jour 5)

**Réalisé (Jour 3)**
- Référentiel des **spécialités** (`Specialty`) : lecture publique, création/modification
  admin (migration `add_doctor_verification`).
- **Profils professionnels** (`DoctorProfile`, `DoctorSpecialty`) : création et
  complétion par le professionnel lui-même, champs strictement autorisés.
- **Qualifications** (`ProfessionalCredential`) : déclarées en **métadonnées** (type,
  autorité émettrice, référence, date) — aucune pièce justificative stockée à ce stade.
- **Workflow de vérification** (`DoctorVerificationRequest`, `DoctorVerificationChecklist`,
  `DoctorVerificationEvent`) : brouillon, soumission, transitions d'état
  (soumis → en revue → approuvé / refusé / correction), audit **append-only** à chaque
  étape.
- Décisions **admin uniquement** ; refus d'auto-décision (un professionnel ne valide pas
  sa propre demande) ; transitions invalides rejetées ; motif requis pour refus/correction.
- Attribution du rôle `DOCTOR` **uniquement** après approbation administrative.
- **Répertoire public** : profil visible uniquement si vérifié **et** explicitement publié ;
  profils non vérifiés/non listés → `404` (pas de fuite d'existence).
- Tests e2e (parcours complet + négatifs) dans `backend/test/doctors.e2e-spec.ts` (27 tests
  e2e au total).

**Réalisé (Jour 4)**
- **Établissements de santé** (`HealthcareFacility`) : secteur (`PUBLIC`/`PRIVATE`),
  types normalisés, gouvernorats (24), adresse et contacts ; création par un utilisateur
  authentifié ; modification et demande de vérification réservées aux **gestionnaires**
  nommés par un admin (droits limités à la ressource, aucun rôle global).
- **Répertoire public** : liste paginée/filtrée (recherche texte, gouvernorat, secteur,
  type) et fiche détaillée ; limité aux établissements **vérifiés et publiés** (les autres
  → `404`, aucune fuite d'existence).
- **Vérification des établissements** : workflow identique à celui des médecins
  (brouillon, soumission, transitions validées, historique **append-only**, une seule
  demande active, décision admin uniquement, pas d'auto-décision).
- **Affiliations médecins-établissements** : demande, décision admin, clôture ;
  une seule affiliation active par paire (unicité en base + service) ; seules les
  affiliations **vérifiées** sont visibles publiquement.
- Pages frontend : `/facilities` (répertoire + recherche), fiche `/facilities/[id]`,
  espace de gestion `/facilities/[id]/manage`, affiliations `/dashboard/affiliations`.
- Tests e2e dans `backend/test/facilities.e2e-spec.ts` (42 tests e2e au total).

**Réalisé (Jour 5)**
- **Recherche de médecins** (`DoctorProfile` public) : répertoire paginé/filtré (texte,
  spécialité, gouvernorat, secteur, langue, tri `name`/`newest`) ; limité aux profils
  **vérifiés et publiés** (`isPubliclyListed`), les autres → `404` (aucune fuite
  d'existence).
- **Recherche combinée** `GET /api/search` (`type=all|doctors|facilities`) réutilisant les
  services publics existants ; règle de publication (vérifié + listé) unique côté serveur,
  aucune duplication de la logique métier.
- **Index ciblés** ajoutés par la migration `add_search_indexes` (tri/recherche par nom,
  spécialités, affiliations publiées).
- Filtres de disponibilité (`availability`/`date`) refusés par `400` tant que les agendas
  (Phase 3) n'existent pas — aucun créneau n'est jamais simulé.
- Pages frontend : `/doctors` (répertoire + filtres), fiche `/doctors/[id]`, `/search`
  (recherche combinée avec onglets Tout/Médecins/Établissements) ; `/facilities` enrichi
  (filtre spécialité, tri, liens croisés médecins ↔ établissements).
- Tests e2e dans `backend/test/search.e2e-spec.ts` ; suite e2e complète : **57 tests,
  5 suites** (auth, doctors, facilities, health, search), migrations appliquées sur la base
  embarquée.

**Fonctionnalités prévues / restantes**
- Profils patients (données minimales).
- Référentiels : services, villes.
- Affiner la fiche établissement : services, horaires, géolocalisation.

**Dépendances techniques**
- Modèles Prisma correspondants ; contraintes d'intégrité.
- Vérification des types de documents (stockage sécurisé le moment venu).
- Audit des changements de statut de vérification (déjà en place, à enrichir).

**Risques à traiter**
- Qualité des données de référence (doublons, incohérences).
- Faux profils professionnels (usurpation d'identité professionnelle).
- Spam/modération à la création d'établissements (création ouverte, maîtrise par la
  vérification).

**Validations juridiques / institutionnelles**
- **Critères de vérification** des professionnels (source de vérité : ordre, ministère ?).
- Autorisations nécessaires pour référencer des établissements.

**Critère de sortie** : recherche de médecins/établissements fonctionnelle ; vérification
professionnelle opérationnelle (workflow de vérification opérationnel). — *Atteint (Jour 5)*.

---

## Phase 3 — Agendas, disponibilités et rendez-vous (terminée — Jours 6 et 7)

**Réalisé (Jour 6)**
- **Agendas de consultation** (`AppointmentSchedule`) liés aux affiliations vérifiées :
  fuseau, durée de visite, statut, et (à partir du Jour 7) mode de confirmation.
  Création/modification réservées au praticien de l'affiliation.
- **Créneaux** (`AppointmentSlot`) générés par jour (`POST .../slots/generate`), avec
  protection contre les chevauchements et suppression d'un créneau encore ouvert.
- **Disponibilités publiques** d'un agenda (`GET .../availability`, seuls les créneaux
  ouverts et futurs sont exposés).
- **Réservation** (`POST /appointments`) **idempotente** (`idempotencyKey`) : pas de double
  réservation en concurrence ; un créneau déjà pris est refusé.
- **Annulation** par le patient (`POST .../cancel`).
- **Cycle de vie** des statuts (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`,
  `NO_SHOW`, ...) et **audit append-only** (`AppointmentEvent`) de chaque transition.
- Pages frontend : espace patient `/dashboard/appointments`, écran praticien
  `/dashboard/schedules/[affiliationId]`.

**Réalisé (Jour 7)**
- **Mode de confirmation explicite** (`AppointmentConfirmationMode`) : `AUTOMATIC`
  (confirmation immédiate), `MANUAL` (décision du praticien), `DISABLED` (réservation en
  ligne refusée par `409`). Compatibilité conservée avec `requiresConfirmation` ; entrée
  contradictoire rejetée (`400`).
- **Décisions praticien** (`CONFIRM`, `REJECT`, `COMPLETE`, `NO_SHOW`) bornées par une
  machine à états ; motif requis pour un refus. Gestionnaires d'établissement autorisés
  pour leurs affiliations.
- **Audit non falsifiable au niveau base** : déclencheurs `BEFORE UPDATE OR DELETE`
  (`sahatn_audit_append_only`) sur `AppointmentEvent`, `AppointmentScheduleEvent`,
  `DoctorVerificationEvent`, `FacilityVerificationEvent` (migration
  `add_appointment_reliability`).
- **Notifications découplées** via une file (`NotificationOutbox`, déduplication par
  `dedupeKey`) et un adaptateur de canal (adaptateur **Noop** branché : marque `SKIPPED`,
  ne prétend jamais avoir envoyé). Endpoints `GET /notifications/me` (patient) et
  `GET`/`POST /admin/notifications[...]` (admin). Aucune fuite du motif patient.
- Tests : **53 unitaires / 71 e2e** (dont immuabilité append-only, `DISABLED` → `409`,
  confirmation automatique, décision gestionnaire, file de notifications + dispatch).

**Fonctionnalités prévues / restantes**
- Rappels planifiés (fenêtre avant rendez-vous) et réessais automatiques.
- Adaptateur email/SMS réel ; préférences et consentement de communication.
- Services et horaires des établissements.

**Dépendances techniques**
- Modèles agenda/créneau/rendez-vous (faits).
- Gestion des conflits de créneaux (cohérence transactionnelle) (faite).
- Service de notifications (email d'abord) — interface prête, adaptateur réel à venir.

**Risques à traiter**
- Doubles réservations / conditions de concurrence (traités par idempotence + unicité).
- Annulations abusives (*no-show*) — comptabilisation à affiner.

**Validations juridiques / institutionnelles**
- Règles de protection des données liées aux rendez-vous.

**Critère de sortie** : cycle de vie complet d'un rendez-vous, testé (unitaires +
intégration + e2e). — *Atteint (Jour 6 et consolidé au Jour 7)*.

---

## Phase 4 — Dossiers médicaux et contenu clinique (terminée — Jour 8)

**Réalisé (Jour 8)**
- **Dossier médical longitudinal** par patient (`MedicalRecord`) et **consultations**
  (`ClinicalEncounter`) rattachées à un praticien et, le cas échéant, à un établissement.
- **Contenu clinique structuré** : observations (`ClinicalObservation`, avec catégorie et
  code), diagnostics (`ClinicalDiagnosis`) et allergies (`PatientAllergy`), liés au dossier.
- **API clinique** côté patient (`/medical-records/me[...]`) et côté professionnel
  (`/medical-records/patients/:patientUserId[...]`), avec lectures et écritures.
- **Audit systématique** de chaque accès et de chaque écriture via
  `MedicalRecordAccessEvent`.
- **Immuabilité scellée en base** : déclencheurs `BEFORE DELETE`
  (`sahatn_clinical_no_delete`) empêchant la suppression silencieuse d'un dossier ou d'une
  consultation.

**Fonctionnalités prévues / restantes**
- Comptes rendus et ordonnances (structure de données dédiée).
- Versionnage des documents et **chiffrement au repos** des données médicales.
- Traitements médicamenteux.

**Dépendances techniques**
- Modèle de données cliniques (fait).
- Versionnage des documents (à venir).
- Chiffrement au repos des données médicales (à venir).
- **Audit systématique** de chaque accès (fait, append-only scellé en base).

**Risques à traiter**
- Fuite d'information, accès non autorisé, altération de dossier.
- Cohérence de l'historique longitudinal.

**Validations juridiques / institutionnelles**
- Base légale d'accès aux données médicales (traitée fonctionnellement au Jour 9).
- Statut légal des comptes rendus et ordonnances.
- Durées de conservation.

**Critère de sortie** : accès aux dossiers strictement conditionné par le contexte
(relation de soin / consentement), avec audit testé. — *Atteint (Jour 9)*.

---

## Phase 5 — Autorisations d'accès, consentement, accès d'urgence (terminée — Jour 9)

**Réalisé (Jour 9)**
- **Moteur d'autorisation unique** (`RecordAccessService`) : aucune couche métier ne décide
  seule de l'accès ; les contrôleurs et services cliniques y délèguent.
- **Consentement explicite et granulaire** (`MedicalRecordGrant`) : permissions de lecture et
  d'écriture, fenêtre de validité (`effectiveFrom`, `expiresAt`), cycle de vie
  `ACTIVE`/`REVOKED` journalisé (`MedicalRecordGrantEvent`, append-only).
- **Refus par défaut** : le rôle `DOCTOR`, une affiliation ou un rendez-vous passé ne
  donnent **jamais** accès à un dossier — seule une autorisation explicite ou l'urgence le
  permettent. Tout refus est audité (`ACCESS_DENIED`) avec un code de raison borné.
- **`CareRelationship`** (relation de soin) : projection **informative** dérivée des
  rendez-vous ou du consentement, jamais utilisée comme clé d'accès.
- **Accès d'urgence encadré** (*break-glass*, `EmergencyAccessGrant`) : **lecture seule**,
  durée limitée (24 h), justification obligatoire, activation/expiration auditées et
  **notification du patient**. Les écritures n'ont aucun repli d'urgence.
- **Journal d'accès append-only** (`MedicalRecordAccessEvent`) scellé en base, protégé en
  écriture et contre la suppression.
- Pages frontend : dossier patient et détail de consultation
  (`/dashboard/records`), gestion des consentements, relations et journal d'accès
  (`/dashboard/records/access`), liste des patients accessibles et détail praticien
  (`/dashboard/patients`, `/dashboard/patients/[patientUserId]`).
- Tests : **71 unitaires / 84 e2e** (dont refus hors contexte, granularité des permissions,
  révocation immédiate, autorisation expirée/non effective, urgence lecture seule +
  notification + expiration, audit des refus, immuabilité append-only).

**Fonctionnalités prévues / restantes**
- Revue a posteriori outillée des accès d'urgence et alerte administrateur (Phase 7).
- Délégations (représentant légal, tuteur) et consentement implicite.
- Préférences de communication et consentement associé.

**Dépendances techniques**
- Moteur de règles d'autorisation (fait).
- Journal d'audit append-only + alertes (journal fait ; alertes à venir, Phase 7).

**Risques à traiter**
- Usage abusif de l'accès d'urgence (borné + audité + notifié ; revue à outiller).
- Complexité des règles d'autorisation (centralisée dans un moteur unique et testé).

**Validations juridiques / institutionnelles**
- **Cadre de l'accès d'urgence** (qui, quand, quelles limites) — à valider.
- Consentement : formes et exceptions légales — à valider.

**Critère de sortie** : démonstration que l'accès hors contexte est refusé et audité.
— *Atteint (Jour 9)*.

---

## Phase 6 — Documents médicaux, laboratoires, analyses et imagerie (Jour 10 — atteint)

**Réalisé (Jour 10)**
- **Documents médicaux** (`MedicalDocument`) : métadonnées en base, **contenu binaire
  hors base** dans un stockage privé. Catégories (`LAB_RESULT`, `IMAGING`, `REPORT`,
  `PRESCRIPTION`, `OTHER`), rattachement optionnel à une consultation, cycle de vie
  `ACTIVE`/`ARCHIVED` (archivage logique, jamais de suppression silencieuse).
- **Stockage privé abstrait** (`MedicalDocumentStorage`) avec implémentation locale
  (`LocalPrivateDocumentStorage`) : clé **générée par le serveur** (`documents/AAAA/MM/<uuid>`),
  protection contre la traversée de répertoire, permissions restreintes. Aucune URL
  publique ; le contenu n'est servi qu'après autorisation.
- **Validation du contenu** : type MIME **déduit des octets** (magic bytes), strictement
  borné (PDF, PNG, JPEG, WEBP) ; incohérence extension / type déclaré / contenu rejetée ;
  taille bornée par la configuration (`DOCUMENT_MAX_FILE_BYTES`, 5 Mo par défaut) ; dépôt
  vide/refusé audité (`DOCUMENT_REJECTED` avec code de raison borné).
- **Intégrité vérifiée** : empreinte **SHA-256** calculée au dépôt et re-vérifiée à chaque
  téléchargement (contenu altéré → refus + audit).
- **Autorisation réutilisant le moteur Jour 9** : lecture/téléchargement sous
  `VIEW_DOCUMENTS` (ou accès d'urgence en lecture seule), dépôt/archivage sous
  `WRITE_DOCUMENTS` (jamais l'urgence) ; le patient a toujours accès à ses propres
  documents. La clé de stockage n'est **jamais** exposée par l'API.
- **Audit** : actions `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`,
  `DOCUMENT_ARCHIVED`, `DOCUMENT_REJECTED` dans le journal append-only.
- Pages frontend : documents du patient (`/dashboard/records/documents`) et section
  documents de la fiche patient praticien (`/dashboard/patients/[patientUserId]`).
- Tests : **96 unitaires / 98 e2e** (dont dépôt/liste/lecture/téléchargement, archivage,
  refus sans fichier / trop volumineux / type incohérent / non supporté, accès refusé sans
  autorisation, granularité `VIEW`/`WRITE`, croisement de dossiers, urgence lecture seule,
  altération de contenu).

**Fonctionnalités prévues / restantes**
- Enregistrement de **résultats d'examens** structurés (biologie, imagerie) en plus des
  pièces jointes génériques.
- **Antivirus** et **chiffrement au repos** du contenu ; stockage objet privé
  (S3-compatible) via l'interface existante.
- Versionnage des documents et politique de rétention.

**Dépendances techniques**
- Modèles de résultats et de pièces jointes sécurisées (pièces jointes faites).
- Stockage de fichiers chiffré, antivirus, types autorisés bornés (types bornés faits ;
  chiffrement/antivirus à venir).

**Risques à traiter**
- Fichiers malveillants, fuite de pièces jointes (types + autorisation + audit + intégrité
  faits ; antivirus à venir).
- Volume de données et coûts de stockage.

**Validations juridiques / institutionnelles**
- Règles sur les comptes rendus d'examens et imagerie.

**Critère de sortie** : dépôt/consultation de résultats sécurisé et audité.
— *Dépôt/consultation de documents médicaux atteint (Jour 10)*.

---

## Phase 7 — Journal d'audit avancé et détection d'activités suspectes

**Fonctionnalités prévues**
- Tableau de bord d'audit.
- Détection d'anomalies (accès massifs, hors horaires, échecs répétés).
- Alertes aux administrateurs.

**Dépendances techniques**
- Agrégation/analyse des journaux ; règles de détection.
- Conservation et intégrité des journaux.

**Risques à traiter**
- Faux positifs / faux négatifs ; performance sur de gros volumes.

**Validations juridiques / institutionnelles**
- Encadrement de la surveillance interne (respect des personnes).

**Critère de sortie** : détection d'un scénario simulé d'abus, avec alerte.

---

## Phase 8 — Administration, qualité des données, notifications avancées

**Fonctionnalités prévues**
- Console d'administration complète.
- Curation et déduplication des référentiels.
- Notifications multicanal (email/SMS/push) avec préférences.

**Dépendances techniques**
- Outils d'administration ; fournisseurs de notification.

**Risques à traiter**
- Qualité et cohérence à grande échelle.

**Validations juridiques / institutionnelles**
- Communication aux patients (marketing vs. soin).

---

## Phase 9 — Interopérabilité (en cours — Jour 11)

**Réalisé (Jour 11)**
- **Audit de correspondance** entre les modèles SahaTN et **HL7 FHIR R4 (4.0.1)** :
  ressource par ressource (Patient, Practitioner, Organization, Encounter, Observation,
  Condition, AllergyIntolerance, DocumentReference, Provenance). Aucune table ni migration
  ajoutée : l'interopérabilité est une **projection en lecture**.
- **Couche d'adaptateurs découplée** : source de données neutre (`FhirExportSource`) →
  convertisseurs purs par ressource → **port** `InteroperabilityAdapter` (jeton
  `INTEROPERABILITY_ADAPTER`) avec implémentation `FhirR4Adapter`. Le cœur du domaine
  n'est pas couplé au format externe ([ADR-0014](decisions/0014-prototype-fhir-r4.md)).
- **Export prototype en lecture seule** : Bundle FHIR `collection` à **contenu déterministe**
  (`GET /api/fhir/demo/bundle` sur jeu **fictif** figé, `GET /api/fhir/me/bundle` patient,
  `GET /api/fhir/patients/:patientUserId/bundle` praticien **autorisé**). Aucune intégration
  réseau, aucun serveur FHIR, aucune écriture/import.
- **Stratégie d'identifiants** : identifiants internes exposés sous un système local
  **`urn:sahatn:identifier:*`** ; email/téléphone uniquement en `telecom` ; **jamais**
  présentés comme identifiant sanitaire national (inexistant/inconnu).
- **Terminologies** : uniquement des systèmes standards (v3-ActCode pour `Encounter.class`,
  observation-category, condition-clinical/condition-ver-status, allergyintolerance-clinical,
  data-absent-reason). Aucune terminologie tunisienne inventée ; pas de correspondance de
  texte libre vers un code sans mapping fiable (`certainty = UNKNOWN` → `dataAbsentReason`).
- **Sécurité réutilisée** : export patient/praticien sous le **moteur d'autorisation Jour 9**
  (`VIEW_RECORD`/`VIEW_ENCOUNTERS`/`VIEW_OBSERVATIONS`/`VIEW_DIAGNOSES`/`VIEW_ALLERGIES`/
  `VIEW_DOCUMENTS`, urgence en lecture seule), **journalisé** (`RECORD_VIEWED`, cible
  `FhirExport`) ; un export **refusé** est également **audité** (`ACCESS_DENIED`), sans donnée
  clinique. Le bundle n'expose **jamais** la clé de stockage des documents, les secrets
  ni le journal d'accès.
- **Validation structurelle** (`validateFhirBundle`) : forme, champs requis, format d'`id`,
  intégrité des références, absence de clés/valeurs interdites (ex. `storageKey`,
  `private-documents`).
- **Validation indépendante** (`validateFhirBundleAgainstSchema`) : conformité de forme au
  **schéma JSON officiel HL7 FHIR R4 (4.0.1)**, archivé avec empreinte SHA-256
  (`backend/test/fixtures/fhir-r4/`).
- Tests : **147 unitaires / 112 e2e** (dont déterminisme du bundle, validité structurelle,
  conformité au schéma officiel FHIR R4, intégrité des références, refus non autorisé sans
  donnée clinique, relation de soin seule insuffisante, auto-export patient, granularité par
  permission, secteurs retirés sans référence pendante, accès aux documents borné par
  `VIEW_DOCUMENTS` sans fuite de clé de stockage, refus audité, identifiants synthétiques de
  la démo, absence de fuite du journal d'accès).

**Fonctionnalités prévues / restantes**
- **Connecteurs institutionnels réels** : nécessitent des profils FHIR retenus, des
  terminologies nationales, une correspondance d'identité (identifiant sanitaire), des
  accords techniques et un cadre juridique — **hors périmètre** tant qu'ils ne sont pas
  confirmés ([ADR-0014](decisions/0014-prototype-fhir-r4.md)).
- Import/écriture FHIR, serveur FHIR exposé, `Bundle` de type `transaction`.

**Dépendances techniques**
- Couche d'adaptation, mapping FHIR, sécurité des échanges.
- Accords techniques avec les systèmes partenaires.

**Risques à traiter**
- Qualité et sensibilité des données échangées ; sécurité inter-systèmes.
- Dépendance à des systèmes dont l'accès n'est pas garanti.

**Validations juridiques / institutionnelles**
- **Autorisations d'échange** avec les systèmes publics/privés.
- Accès à un éventuel identifiant sanitaire national.
- Standards d'échange retenus.

**Critère de sortie** : un échange encadré démontré avec un système **autorisé**.
— *Prototype d'export FHIR R4 en lecture seule, audité et documenté, atteint (Jour 11) ;
l'échange avec un système autorisé reste à réaliser.*

---

## Phase transverse — Expérience utilisateur et design (terminée — Jour 13)

**Réalisé (Jour 13)**
- **Audit d'interface** de tous les écrans (publics et espace connecté) : cohérence,
  accessibilité, responsive, états de chargement/vide/erreur.
- **Système de design** dans `globals.css` : palette bleu profond / turquoise, échelles
  d'espacement, rayons, ombres, anneau de focus, `prefers-reduced-motion`, points de rupture
  (mobile ≥ 360 px, tablette ~ 768 px, bureau ≥ 1280 px).
- **Bibliothèque de composants partagés** (`components/ui.tsx`) : bouton, carte, badge de
  statut, alerte, en-tête de page, fil d'Ariane, états vide/erreur/chargement, pagination,
  statistiques, champ de formulaire.
- **Châssis global** : en-tête et pied de page communs, `AuthProvider` (profil unique),
  coquille de tableau de bord avec navigation latérale **adaptée au rôle**.
- **Accessibilité** : lien d'évitement, focus visible, contrastes, libellés, ordre des
  titres, cibles tactiles, remplacement de `window.confirm/prompt` par une boîte de
  confirmation accessible et `window.alert` par des alertes contextuelles.
- **Libellés français** centralisés (`lib/labels.ts`) et navigation (`lib/nav.ts`).
- Aucune modification des contrats d'API, des règles d'autorisation ni du modèle de données.

**Reste à faire**
- Thème sombre, tests d'accessibilité automatisés (axe), audit visuel navigateur outillé.

**Critère de sortie** : interface homogène, accessible et responsive sur tous les écrans,
sans régression fonctionnelle. — *Atteint (Jour 13 : lint, typecheck et build verts).*

---

## Phase transverse — Tests navigateur, accessibilité et non-régression (terminée — Jour 14)

**Réalisé (Jour 14)**
- **Tests navigateur réels** avec **Playwright** (Chromium sans interface) et
  **axe-core** : **42 tests** répartis en 7 fichiers (`public`, `auth`, `patient`,
  `roles`, `security`, `accessibility`, `responsive`), couvrant les parcours publics,
  patients, praticien, établissement et administrateur, le cloisonnement des rôles,
  les états vide/erreur et l'accessibilité (WCAG 2.1 A/AA).
- **Harnais isolé et reproductible** : base éphémère `embedded-postgres` (migrations +
  seed fictif + administrateur de test) démarrée par
  `backend/test/browser/start-server.mjs`, orchestrée par `frontend/playwright.config.ts`
  (backend + `next start`, un seul worker). Scripts `test:e2e` / `test:e2e:report`.
- **Aucune nouvelle fonctionnalité métier ni dépendance d'exécution** : outillage de
  développement uniquement. Aucun contrat d'API ni règle d'autorisation modifié.
- **Corrections d'accessibilité / UX** issues des tests : restauration du focus et piège
  de tabulation dans `ConfirmDialog` ; focus déplacé par le lien d'évitement ; contraste
  corrigé (`--success-700`, `.side-nav__desc`) ; ordre de déconnexion fiabilisé.
- **Non-régression confirmée** : backend `lint`/`typecheck`/`build` verts,
  **147 unitaires / 112 e2e** ; frontend `lint`/`typecheck`/`build` verts ; **42/42**
  tests navigateur verts.
- Rapport détaillé : [frontend-ux.md](frontend-ux.md) §8.

**Reste à faire**
- Thème sombre ; traiter les violations axe résiduelles documentées ; intégrer les
  tests navigateur à une CI.

**Critère de sortie** : parcours principaux vérifiés dans un navigateur réel,
accessibilité et cloisonnement des rôles testés, sans régression. — *Atteint (Jour 14).*

---

## Phase transverse — Fiabilité backend et configuration (terminée — Jour 15)

**Réalisé (Jour 15)**
- **Validation d'environnement renforcée** : transformation explicite et stricte des entiers (`PORT`, `SESSION_TTL_SECONDS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `DOCUMENT_MAX_FILE_BYTES`) dans `env.validation.ts` (vérification d'entier signé/valide uniquement, sans conversion implicite globale). Tout entier fourni sous forme de chaîne numérique est accepté (`4000`, `65535`, bornes) ; chaînes vides, décimales, non numériques, `Infinity`/`NaN`, hors bornes ou hors `Number.isSafeInteger` sont **rejetées** avec un message identifiant la variable, **sans remplacement silencieux** par la valeur par défaut. Démarrage échoue proprement (code de sortie 1) si la configuration est invalide.
- **Tests unitaires de configuration** : `backend/src/config/env.validation.spec.ts` (28 cas) couvrant valeurs par défaut, valeurs valides (chaînes numériques, bornes), cas invalides (limites, formats) et non altération des variables non entières.
- **Création concurrente du dossier patient** : vérification de `ensurePatientRecord` (rattrapage de `Prisma.PrismaClientKnownRequestError` `P2002` par relecture) et ajout d'un test e2e de concurrence (`medical-records.e2e-spec.ts#14`) : lectures simultanées produisent **exactement un seul** `MedicalRecord` et **une seule** entrée `RECORD_CREATED`, sans fuite croisée.
- **Contrat des affiliations du praticien** : `GET /api/doctors/me/affiliations` renvoie `200 []` lorsqu'aucun profil praticien n'existe (comportement intentionnel, sans révélation d'existence) ; lorsqu'un profil existe, il renvoie **l'historique complet** (y compris les affiliations `ENDED`), conservé pour audit/historique. Ajout d'un test e2e (`facilities.e2e-spec.ts#16`) validant les deux cas.
- **Démarrage et configuration reproductibles** : l'application démarre avec les valeurs par défaut ; accepte `PORT` fourni sous forme de chaîne numérique ; une configuration invalide échoue proprement sans exposer de secrets dans les messages d'erreur. Scripts et Docker inchangés (pas de nouveau service).
- **Non-régression** : backend `lint`/`typecheck`/`build` verts ; tests unitaires backend **175/175** (dont 28 nouveaux) ; tests e2e backend **114/114** (+2 nouveaux cas e2e). La référence 112/112 est mise à jour avec les nouveaux tests documentés.

**Reste à traiter** : intégrer les tests navigateur à la CI, thème sombre, traiter les violations axe résiduelles documentées.

**Critère de sortie** : validation d'environnement explicite, robustesse à la concurrence sur la création de dossier, contrat des affiliations clarifié et testé, non-régression complète. — *Atteint (Jour 15).*

---

## Phase transverse — Intégration continue (terminée — Jour 16)

**Réalisé (Jour 16)**
- **Workflow GitHub Actions** `.github/workflows/ci.yml` (plateforme retenue : la seule
  présente dans le dépôt ; aucun workflow redondant créé). Deux jobs sur runners séparés :
  `backend` puis `frontend`.
- **Job backend** : `npm ci` (lockfile), `prisma generate`, `lint`, `typecheck`, `build`,
  `prisma migrate deploy`, **validation des variables d'environnement** (démarrage valide
  avec `PORT` numérique ; échec attendu nommant la variable pour une configuration
  invalide), tests unitaires et **tests e2e adossés à un service PostgreSQL 16 isolé**
  (base fictive `sahatn_test`, healthcheck `pg_isready`).
- **Job frontend** : installe et construit aussi le backend (requis par le serveur de test
  navigateur), puis `lint`, `typecheck`, `build` de production, installation de Chromium
  (`playwright install --with-deps`) et **tests Playwright + axe-core** (42 tests). Les
  contrôles d'accessibilité existants sont conservés tels quels.
- **Isolation et reproductibilité** : aucune base réelle ni donnée personnelle ; valeurs de
  test fictives ; `reuseExistingServer: false` (aucune dépendance à un serveur local) ;
  ports de test distincts (backend `4000`, frontend `3100`) ; bases embarquées sur ports
  dédiés (`55432`/`55433`) ; arrêt des processus dans les `finally` des scripts.
- **Échecs et artefacts** : tout échec de contrôle fait échouer le workflow ; les artefacts
  utiles (journal de configuration invalide, rapport/traces/captures Playwright) sont
  publiés à la demande avec **rétention courte** (5–7 jours) et **sans secrets, cookies,
  jetons ni données personnelles**.
- **Documentation** : nouveau [`docs/ci.md`](ci.md) (contrôles, commandes locales,
  prérequis e2e/Playwright, diagnostic, limites) ; mises à jour de `README.md` et
  `docs/architecture.md` §8-9.
- **Aucune modification métier** : pas de changement d'API, d'autorisation ou de schéma ;
  pas de déploiement automatique, de publication d'image Docker ni de service externe.

**Reste à faire**
- Envisager une matrice multi-navigateurs et une comparaison visuelle (hors périmètre).
- Ajouter des contrôles de sécurité automatisés (audit de dépendances) — non demandés ici.

**Critère de sortie** : contrôles backend (dont e2e PostgreSQL) et frontend (Playwright +
axe-core) exécutables de façon reproductible, échec propagé au workflow, aucun secret.
— *Atteint (Jour 16).*

---

## Sujets transverses (à traiter en continu)

| Sujet                          | Nature        | Statut            |
| ------------------------------ | ------------- | ----------------- |
| Cadre juridique tunisien (santé)| Juridique     | **À vérifier**    |
| Hébergement des données         | Institutionnel| **À vérifier**    |
| Politique de conservation       | Juridique     | **À définir**     |
| Sauvegardes & restauration      | Technique     | À implémenter     |
| CI/CD et tests automatisés      | Technique     | **En place (Jour 16)** |
| Observabilité (logs/métriques)  | Technique     | À mettre en place |

## Questions ouvertes prioritaires

1. Quelles sont les **sources de vérité** pour la vérification des médecins et des
   établissements en Tunisie ?
2. Existe-t-il un **identifiant sanitaire national** exploitable, et sous quelles
   conditions ?
3. Quelles sont les **exigences d'hébergement** (localisation, agrément) pour des
   données de santé ?
4. Quelle est la **base légale** d'accès aux données médicales (soin, consentement,
   urgence) ?
5. Quel **standard d'échange** (FHIR et profil) est pertinent et acceptable ?

> Ces questions ne doivent pas être tranchées par hypothèse : elles nécessitent des
> réponses juridiques et institutionnelles.
