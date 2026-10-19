# ADR-0006 — Interopérabilité et évaluation de HL7 FHIR

- **Statut** : Remplacé par [ADR-0014](0014-prototype-fhir-r4.md) (Jour 11)
- **Date** : Jour 1

## Contexte

SahaTN devra se relier progressivement à des systèmes de santé existants (publics et
privés). Les standards d'échange doivent être choisis, mais **aucun accès** à des API
nationales, identifiants sanitaires ou bases médicales n'est garanti ni confirmé.

## Décision (proposition)

- Concevoir une **couche d'adaptateurs** dans un module `interoperability`, découplée des
  domaines pour ne pas imposer de format externe au cœur du système.
- **Évaluer HL7 FHIR** (ressources Patient, Practitioner, Organization, Appointment,
  Encounter, Observation...) comme standard d'échange candidat.
- **Ne mettre en œuvre aucune intégration réelle** sans confirmation et autorisation.

## Alternatives considérées

- Format propriétaire ad hoc : rejeté (non interopérable).
- FHIR imposé d'emblée au cœur du modèle : rejeté (rigidité prématurée).

## Conséquences

**Avantages**
- Préparation à l'interopérabilité sans dépendance prématurée.
- Découplage préservé.

**Limites / points ouverts**
- Périmètre et profil FHIR à définir.
- Correspondance d'identité (identifiant sanitaire national) inconnue.
- Cadre juridique d'échange à valider.

**Suites**
- Vérifier l'existence et les conditions d'accès des systèmes nationaux.
- Statut à réévaluer en Phase 9 (voir [`../roadmap.md`](../roadmap.md)).
