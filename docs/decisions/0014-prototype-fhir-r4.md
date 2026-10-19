# ADR-0014 — Prototype d'export FHIR R4 en lecture seule

- **Statut** : Accepté
- **Date** : Jour 11
- **Remplace** : [ADR-0006](0006-interoperabilite-fhir.md) (proposition d'évaluation)

## Contexte

SahaTN devra à terme échanger des données avec des systèmes de santé existants. La
proposition initiale ([ADR-0006](0006-interoperabilite-fhir.md)) retenait une approche par
adaptateurs et l'évaluation de **HL7 FHIR**, sans rien mettre en œuvre tant qu'aucune
intégration réelle n'est confirmée et autorisée.

Il manquait néanmoins une **concrétisation technique** : un mapping documenté, une couture
logicielle découplée du domaine, et un **prototype vérifiable** démontrant la faisabilité de
la projection FHIR — **sans** dépendre d'un accès à un système national (inexistant/inconnu),
sans identifiant sanitaire national, et sans terminologies nationales confirmées.

## Décision

- **Cible** : **HL7 FHIR R4 (4.0.1)** (`https://hl7.org/fhir/R4`), comme **baseline**.
- **Périmètre strictement en lecture (prototype)** : produire des **bundles FHIR de type
  `collection`** par **projection** des données existantes. **Aucune** écriture, **aucun**
  import, **aucun** serveur FHIR exposé, **aucune** connexion réseau vers un système externe.
- **Architecture par adaptateur** dans un module dédié `fhir` :
  - une **source neutre** (`FhirExportSource`) découple les convertisseurs des modèles Prisma ;
  - des **convertisseurs purs** par ressource ;
  - un **port** `InteroperabilityAdapter` (jeton `INTEROPERABILITY_ADAPTER`) et une
    implémentation `FhirR4Adapter`, afin que le cœur du domaine reste **indépendant du
    format externe** et que d'autres profils/adaptateurs puissent être ajoutés sans le
    modifier.
- **Ressources projetées** : Patient, Practitioner, Organization, Encounter, Observation,
  Condition, AllergyIntolerance, DocumentReference, Provenance. Pas d'`AuditEvent` dans les
  bundles cliniques ; `Provenance` seulement lorsque l'auteur est **connu** et présent.
- **Points d'entrée** (authentifiés) :
  - `GET /api/fhir/demo/bundle` — jeu **fictif déterministe** (démonstration) ;
  - `GET /api/fhir/me/bundle` — patient, ses propres données ;
  - `GET /api/fhir/patients/:patientUserId/bundle` — **praticien autorisé**.
- **Identifiants** : identifiants internes exposés sous un système local
  `urn:sahatn:identifier:*`. Email/téléphone **uniquement** en `telecom`. **Jamais**
  présentés comme identifiant sanitaire national (inconnu/inexistant).
- **Terminologies** : uniquement des systèmes **standards** et fiables
  (`v3-ActCode` pour `Encounter.class`, observation-category, condition-clinical,
  condition-ver-status, allergyintolerance-clinical/-verification, data-absent-reason).
  **Aucune** terminologie nationale inventée ; **pas** de correspondance de texte libre vers
  un code sans mapping fiable (`certainty = UNKNOWN` → `dataAbsentReason`).
- **Sécurité** : exports soumis au **moteur d'autorisation** existant (granulaire par
  section ; urgence en **lecture seule**). Un export **accepté** est audité (`RECORD_VIEWED`,
  cible `FhirExport`) et un export **refusé** l'est aussi (`ACCESS_DENIED`), sans donnée
  clinique. Le bundle **n'expose jamais** la clé de stockage des documents, les secrets
  ni le journal d'accès.
- **Validation** : `validateFhirBundle` vérifie forme, champs requis, format d'`id`,
  intégrité des références et **rejette** les clés/valeurs interdites (`storageKey`,
  `private-documents`, URL/`data:` de pièces jointes). Une **validation indépendante**
  (`validateFhirBundleAgainstSchema`) contrôle en outre la forme contre le **schéma JSON
  officiel HL7 FHIR R4 (4.0.1)**, archivé et vérifié par empreinte SHA-256
  (`backend/test/fixtures/fhir-r4/`).

## Alternatives considérées

- **Imposer FHIR au cœur du modèle** : rejeté (rigidité prématurée, dépendance à un standard
  non confirmé comme référence interne).
- **Serveur FHIR / import FHIR dès maintenant** : rejeté (pas d'usage confirmé, surface
  d'attaque et de complexité inutiles, pas de cadre juridique d'échange).
- **Format propriétaire ad hoc** : rejeté (non interopérable).
- **Attendre un partenaire réel avant tout code** : rejeté (on peut prouver la faisabilité et
  figer la couture sans dépendance externe).

## Conséquences

**Avantages**
- Interopérabilité **démontrée et testée** sans aucune dépendance externe ni donnée réelle.
- **Découplage préservé** : le domaine n'impose pas FHIR ; les convertisseurs restent purs.
- **Réutilisation** du moteur d'autorisation et de l'audit (pas de nouvelle surface d'accès).
- Base réutilisable pour de **futurs connecteurs institutionnels** (le port est le point
  d'extension).

**Limites / points ouverts**
- Les **profils FHIR** (ressources restreintes, extensions, cardinalités) ne sont pas figés :
  ils dépendront du ou des systèmes cibles.
- **Terminologies nationales** et correspondances sémantiques : **à définir** avec les
  autorités.
- **Identifiant sanitaire national** : inexistant/inconnu ; la correspondance d'identité
  reste **ouverte**.
- **Sécurité inter-systèmes** (authentification/mTLS, échange de clés, traçabilité,
  consentement d'échange) et **cadre juridique d'échange** : **hors périmètre**.

**Suites**
- Avant tout connecteur **réel** : confirmer le système partenaire, retenir les profils FHIR
  et terminologies, définir la correspondance d'identité, établir les accords techniques et
  l'autorisation juridique, puis traiter la sécurité des échanges et l'exploitation (Phase 9,
  voir [`../roadmap.md`](../roadmap.md)).
- Réévaluer le statut de la baseline R4 (R5, profils nationaux) au fil des retours
  institutionnels.
