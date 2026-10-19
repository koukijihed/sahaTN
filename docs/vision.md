# Vision fonctionnelle — SahaTN

## 1. Contexte

La Tunisie dispose d'un système de santé réparti entre le secteur public et le secteur
privé. Les informations sont souvent cloisonnées entre établissements, et le patient
doit fréquemment reconstituer lui-même son parcours. SahaTN ambitionne de fournir un
socle numérique national reliant progressivement patients, professionnels et
établissements, tout en respectant la sensibilité des données médicales.

Ce document décrit **quoi** fait SahaTN et **pour qui**, indépendamment des choix
techniques (voir [`architecture.md`](architecture.md)).

## 2. Mission

Offrir une plateforme de santé unifiée, sécurisée et interopérable qui :

1. Simplifie l'accès du patient aux soins (recherche, rendez-vous).
2. Donne aux professionnels un espace de travail vérifié et unique.
3. Contribue à un historique médical longitudinal fiable par patient.
4. Sert de point de raccordement entre établissements et services de santé.

## 3. Acteurs

| Acteur                    | Objectif principal                                                         |
| ------------------------- | -------------------------------------------------------------------------- |
| **Patient**               | Trouver un médecin/établissement, prendre rendez-vous, accéder à son suivi. |
| **Médecin**               | Gérer son agenda, rédiger des comptes rendus, consulter les données utiles. |
| **Établissement**         | Gérer ses lieux, services, praticiens et disponibilités.                    |
| **Personnel administratif** | Gérer secrétariat, prises de rendez-vous, accueil.                        |
| **Administrateur plateforme** | Administrer comptes, qualité des données, sécurité, supervision.       |
| **Auditeur / autorité**   | Contrôler la traçabilité et la conformité (accès encadré).                  |

> Les rôles fins et leurs permissions sont définis dans
> [`security.md`](security.md), section « Séparation des rôles ».

## 4. Parcours utilisateurs (cibles)

### 4.1 Patient

1. Crée un compte et complète son profil personnel (données minimales).
2. Recherche un médecin ou un établissement (spécialité, ville, secteur).
3. Consulte les disponibilités et prend un rendez-vous.
4. Reçoit des notifications (confirmation, rappel, modification).
5. Modifie ou annule un rendez-vous selon les règles définies.
6. Accède progressivement à son historique médical (comptes rendus, ordonnances,
   résultats), dans la limite des autorisations.

### 4.2 Médecin

1. Crée un espace professionnel et fait vérifier sa qualité/qualification.
2. Définit ses lieux d'exercice, ses spécialités et ses disponibilités.
3. Gère ses rendez-vous.
4. Rédige des comptes rendus et consulte les informations médicales **pertinentes**
   des patients qu'il prend en charge, dans le cadre d'une relation de soin autorisée.

### 4.3 Établissement

1. Référence ses lieux d'exercice, ses services et ses praticiens.
2. Coordonne les disponibilités et les rendez-vous de ses services.

### 4.4 Administrateur

1. Vérifie les comptes professionnels.
2. Surveille la qualité des données de référence (spécialités, établissements).
3. Supervise les journaux d'audit et les activités suspectes.

## 5. Modules métier (cible d'architecture)

Ces modules structurent l'architecture. Ils seront développés progressivement.

1. **Identité, authentification et sessions** — comptes, rôles, sessions sécurisées.
2. **Patients et profils personnels** — informations personnelles et préférences.
3. **Médecins, qualifications et vérification** — profils pro, diplômes, validation.
4. **Établissements et lieux d'exercice** — structures, adresses, secteurs.
5. **Spécialités et services médicaux** — référentiels de spécialités et prestations.
6. **Agendas, disponibilités et rendez-vous** — planification et cycle de vie RDV.
7. **Dossiers médicaux et comptes rendus** — documents cliniques structurés.
8. **Diagnostics, allergies, traitements, ordonnances** — données cliniques.
9. **Laboratoires, analyses et imagerie** — résultats d'examens (cible).
10. **Autorisations d'accès aux données médicales** — consentements et partage.
11. **Journal d'audit et détection d'activités suspectes** — traçabilité.
12. **Notifications** — rappels et alertes (email/SMS/push).
13. **Administration et qualité des données** — gouvernance et curation.
14. **Interopérabilité** — échanges avec les systèmes de santé existants (FHIR, etc.).

## 6. Principes fonctionnels

- **Minimalité des données** : ne collecter que le nécessaire au service rendu.
- **Consentement et base légale** : tout accès à des données médicales repose sur une
  base explicite (soin, consentement, urgence encadrée).
- **Traçabilité** : chaque accès à des données médicales est journalisé.
- **Longitudinalité** : l'historique médical se construit dans le temps par patient.
- **Réversibilité** : le patient peut consulter, corriger et, lorsque applicable,
  demander la suppression de ses données (voir politique de conservation).

## 7. Hors périmètre (au moins au départ)

- Téléconsultation vidéo complète (à évaluer ultérieurement).
- Facturation et paiement en ligne (à évaluer ; dépendances réglementaires).
- Prescription électronique à valeur légale (nécessite validation institutionnelle).
- Interconnexion réelle avec des systèmes nationaux (à confirmer et autoriser).

## 8. Indicateurs de succès (à préciser)

- Adoption par les patients et les professionnels.
- Taux de rendez-vous honorés / annulés.
- Complétude et qualité des dossiers.
- Délai de prise en charge.
- Nombre d'incidents de sécurité (cible : 0 fuite non détectée).

> Les indicateurs quantitatifs seront affinés avec les parties prenantes.
