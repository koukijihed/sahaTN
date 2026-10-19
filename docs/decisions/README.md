# Décisions d'architecture (ADR)

Ce dossier consigne les décisions techniques importantes de SahaTN, avec leur contexte,
leurs raisons et leurs conséquences. Le format est inspiré des *Architecture Decision
Records* (ADR).

## Format

Chaque décision suit cette structure :

- **Statut** : Proposé / Accepté / Remplacé / Déprécié
- **Contexte** : pourquoi la décision se pose
- **Décision** : ce qui est retenu
- **Conséquences** : avantages, limites, suites

## Index

| N°   | Décision                                              | Statut  |
| ---- | ----------------------------------------------------- | ------- |
| 0001 | [Monolithe modulaire](0001-monolithe-modulaire.md)    | Accepté |
| 0002 | [Stack NestJS + Prisma + PostgreSQL](0002-nestjs-prisma-postgresql.md) | Accepté |
| 0003 | [Validation stricte côté serveur](0003-validation-stricte.md) | Accepté |
| 0004 | [Autorisation contextuelle des données médicales](0004-autorisation-contextuelle.md) | Accepté |
| 0005 | [Stratégie de tests](0005-strategie-de-tests.md)      | Accepté |
| 0006 | [Interopérabilité FHIR à évaluer](0006-interoperabilite-fhir.md) | Remplacé par 0014 |
| 0007 | [Données fictives uniquement](0007-donnees-fictives.md) | Accepté |
| 0008 | [Sessions opaques en base et protection CSRF](0008-sessions-et-csrf.md) | Accepté |
| 0009 | [Anti-force brute et limitation de débit](0009-anti-force-brute.md) | Accepté |
| 0010 | [Répertoire des établissements et affiliations](0010-repertoire-etablissements.md) | Accepté |
| 0011 | [Fiabilité des rendez-vous, audit append-only et notifications](0011-fiabilite-rendez-vous.md) | Accepté |
| 0012 | [Accès explicite aux dossiers médicaux, consentement et accès d'urgence](0012-acces-consentement-urgence.md) | Accepté |
| 0013 | [Stockage privé et accès contrôlé des documents médicaux](0013-stockage-documents-medicaux.md) | Accepté |
| 0014 | [Prototype d'export FHIR R4 en lecture seule](0014-prototype-fhir-r4.md) | Accepté |

## Ajouter une décision

1. Créer un fichier `NNNN-titre-court.md` avec le numéro suivant.
2. Renseigner Statut, Contexte, Décision, Conséquences.
3. Ajouter une ligne à l'index ci-dessus.
