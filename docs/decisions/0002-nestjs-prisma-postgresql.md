# ADR-0002 — Stack backend NestJS + Prisma + PostgreSQL

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

Le backend doit être modulaire, typé, testable et sécurisé. Il nécessite une API
documentée, une validation stricte et une base relationnelle fiable pour des données de
santé structurées.

## Décision

- **NestJS + TypeScript** pour l'API : architecture modulaire native (modules,
  contrôleurs, services, guards, pipes, intercepteurs), adaptée à un monolithe modulaire
  et aux contrôles d'accès transverses.
- **PostgreSQL** : base relationnelle robuste, transactions ACID, contraintes
  d'intégrité fortes, adaptée aux relations complexes (patient ↔ soin ↔ document).
- **Prisma** : ORM typé et migrations versionnées, requêtes paramétrées (protection
  contre l'injection SQL), schéma lisible.

## Alternatives considérées

| Alternative         | Pourquoi non retenue (à ce stade)                              |
| ------------------- | -------------------------------------------------------------- |
| Express + `pg` brut | Moins structurant ; moins de garde-fous modulaires.            |
| TypeORM             | Prisma offre un meilleur typage et une meilleure DX.           |
| MySQL/MariaDB       | PostgreSQL plus riche (types, extensions, indexation).         |
| MongoDB             | Données de santé fortement relationnelles : relationnel préférable. |

## Conséquences

**Avantages**
- Typage de bout en bout ; documentation OpenAPI facilitée.
- Migrations versionnées et reproductibles.
- Sécurité par défaut (paramétrage, validation).

**Limites**
- Courbe d'apprentissage de NestJS et Prisma.
- Prisma impose sa couche de mapping (moins de SQL « à la main »).

**Suites**
- Configurer Prisma avec un **schéma initial sans modèle métier**.
- Mettre en place la documentation OpenAPI/Swagger.
