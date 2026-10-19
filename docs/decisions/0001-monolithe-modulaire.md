# ADR-0001 — Adopter un monolithe modulaire

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

SahaTN couvre de nombreux domaines (identité, patients, professionnels, établissements,
rendez-vous, dossiers médicaux, audit, interopérabilité...). Une approche microservices
serait envisageable à terme, mais elle introduit très tôt une complexité opérationnelle
élevée : communication réseau, cohérence distribuée, observabilité, déploiement multiple.

## Décision

Démarrer par un **monolithe modulaire** :

- une seule API backend (NestJS) découpée en **modules de domaine** ;
- frontières de modules explicites (un module n'accède pas directement aux tables d'un
  autre) ;
- une seule base PostgreSQL.

## Conséquences

**Avantages**
- Complexité initiale faible ; itération rapide.
- Transactions locales simples ; cohérence des données facilitée.
- Frontières de domaine préparées pour une extraction future.

**Limites**
- Un déploiement unique = couplage de ressources à terme.
- Nécessite de la **discipline** pour respecter les frontières de modules.

**Suites**
- Documenter les dépendances entre modules.
- Réévaluer une extraction en services uniquement si un besoin réel (échelle, équipes,
  isolation) le justifie.
