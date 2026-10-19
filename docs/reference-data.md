# Référentiels et données de référence (SahaTN)

Ce document recense les **référentiels** (listes fermées) utilisés par la plateforme SahaTN.
Il sert de registre de traçabilité : chaque jeu de valeurs indique sa **source**, son
**statut de vérification** et l'endroit du code qui le consomme.

## 1. Principe directeur

> Aucune donnée de référence n'est ajoutée sans source institutionnelle **vérifiée**.

- Aucune donnée personnelle ni donnée de santé réelle n'est utilisée (voir ADR-0007 et
  `docs/security.md`). Toutes les données de démonstration sont **fictives**.
- Un référentiel **externe** (norme nationale, nomenclature professionnelle) n'est
  intégré qu'après vérification de sa **source officielle** et de ses **conditions de
  réutilisation**. En l'absence de vérification, une valeur est marquée « à valider » et
  n'est pas traitée comme normative.
- Les libellés bilingues (français / arabe) doivent être validés par le référentiel
  institutionnel concerné avant toute mise en production.

## 2. Inventaire des référentiels embarqués

| Référentiel | Nombre | Nature | Source | Emplacement |
| --- | --- | --- | --- | --- |
| Gouvernorats | 24 | Découpage administratif officiel de la Tunisie | Division administrative nationale | `prisma/schema.prisma` (`enum Governorate`) |
| Spécialités médicales | 36 | Liste des résidanats | Ordre national des médecins (source citée dans `prisma/seed.mjs`) | `prisma/seed.mjs` (`specialties`) |
| Types d'établissement | 12 | Taxonomie SahaTN (interne) | Définition projet (non normative) | `prisma/schema.prisma` (`enum FacilityType`) |
| Secteurs d'établissement | 2 | Taxonomie SahaTN (interne) | Définition projet | `prisma/schema.prisma` (`enum FacilitySector`) |
| Catégories d'observation clinique | 6 | Taxonomie SahaTN (interne) | Définition projet | `prisma/schema.prisma` (`enum ClinicalObservationCategory`) |
| Signes vitaux | 9 | Catalogue interne de codes d'observation | Définition projet (espace de noms SahaTN) | `src/modules/terminology/terminology.constants.ts` (`VITAL_SIGNS`) |
| Unités UCUM (sous-ensemble) | 7 | Unités de mesure standard | UCUM (`https://ucum.org`) | `src/modules/terminology/terminology.constants.ts` (`UCUM_UNITS`) |

### Gouvernorats (24)

Reproduits à l'identique dans l'énumération `Governorate` et dans
`frontend/lib/labels.ts` (`GOVERNORATE_LABELS_BY_LOCALE`, libellés français **et**
arabe). Toute modification doit être appliquée **des deux côtés** et accompagnée d'une
migration Prisma ; l'oubli d'une locale fait échouer `npm run typecheck`.

### Spécialités (36)

Source institutionnelle citée dans `prisma/seed.mjs` (référentiel des résidanats, Ordre
national des médecins). Les libellés arabes (`labelAr`) sont fournis à titre indicatif et
**doivent être validés** par le référentiel officiel avant tout usage en production.

### Taxonomies internes

`FacilityType`, `FacilitySector` et `ClinicalObservationCategory` sont des **conventions
internes au projet** : elles ne prétendent pas reproduire une nomenclature externe et
peuvent évoluer par décision produit documentée.

### Libellés bilingues (français / arabe)

Le frontend expose une couche de libellés bilingues dans `frontend/lib/labels.ts` :
`SECTOR_LABELS_BY_LOCALE`, `FACILITY_TYPE_LABELS_BY_LOCALE`,
`GOVERNORATE_LABELS_BY_LOCALE` (français **et** arabe), plus les aides `sectorLabel`,
`facilityTypeLabel`, `governorateLabel` et `specialtyLabel(specialty, locale)`.
Les tables sont typées sur des unions littérales : si une valeur d'énumération est
ajoutée ou renommée sans libellé correspondant, **`npm run typecheck` échoue** (garantie
de complétude vérifiée par le compilateur). La locale par défaut reste le français ; les
libellés arabes sont fournis pour préparer l'internationalisation (l'affichage RTL n'est
pas encore activé).

### Signes vitaux (catalogue interne)

`src/modules/terminology/terminology.constants.ts` définit un catalogue de **signes
vitaux** (9 entrées : tensions systolique/diastolique, fréquence cardiaque, fréquence
respiratoire, température, SpO2, poids, taille, IMC) avec des codes appartenant à
l'espace de noms interne SahaTN (`https://sahatn.example/tn/terminology/observation`) et
des unités alignées sur la syntaxe **UCUM**. Aucun code CIM/LOINC/SNOMED n'est reproduit.
Le catalogue est exposé publiquement en lecture seule via
`GET /api/terminology/vital-signs`, `GET /api/terminology/units` et
`GET /api/terminology/observations`. L'intégrité du référentiel (codes uniques, libellés
bilingues non vides, unités UCUM connues) est vérifiée par des tests automatisés.

## 3. Référentiels volontairement NON embarqués

Les référentiels suivants n'ont **pas** été ajoutés faute de source vérifiée et/ou à cause
de contraintes de licence. Ils ne doivent pas être introduits sans validation explicite :

- **Classifications de diagnostic** (CIM-10 / CIM-11 de l'OMS, SNOMED CT) : licence et
  gouvernance requises ; l'usage de SNOMED CT est soumis à des conditions d'affiliation.
- **Terminologies d'analyses** (LOINC) : licence à vérifier.
- **Nomenclatures médicamenteuses** (ATC/OMS, base nationale) : source et version à figer.
- **Identifiants patients nationaux** : aucune hypothèse d'identifiant national n'est posée
  (voir `docs/security.md`).

## 4. Procédure de vérification (avant d'ajouter une donnée)

1. **Identifier** la source institutionnelle officielle et sa version/date.
2. **Vérifier** la correspondance exacte (libellés, ordre, exhaustivité) avec l'énumération.
3. **Vérifier** la licence et les conditions de réutilisation ; documenter ici.
4. **Mettre à jour** le schéma et/ou le seed, ainsi que les libellés frontend si applicable.
5. **Ajouter une migration** Prisma pour tout changement d'énumération.
6. **Documenter** l'ajout dans ce fichier (source, date, auteur du contrôle) et faire passer
   la CI.

## 5. Notes de qualité

- Les libellés affichés dans un terminal Windows PowerShell peuvent apparaître en
  `mojibake` (encodage console) alors que les fichiers sont bien en UTF-8 : ne pas
  conclure à une corruption sur cette seule base.
- Les compteurs ci-dessus reflètent l'état de la base de démonstration à la date de cette
  revue ; toute modification du schéma doit les actualiser.
