# ADR-0007 — Données fictives uniquement

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

Le développement et les démonstrations ne doivent jamais exposer de véritables données de
santé, même de manière temporaire ou en environnement de test.

## Décision

- **Interdiction d'utiliser des données réelles de patients** à toute étape
  (développement, tests, démonstration, seed).
- Tous les jeux de données sont **fictifs** et générés pour l'occasion.
- Les fichiers de configuration et exemples ne contiennent **aucun secret réel**.

## Conséquences

**Avantages**
- Réduction du risque juridique et éthique.
- Environnements de test sûrs.

**Limites**
- Les jeux de données fictifs peuvent ne pas refléter toute la complexité réelle.

**Suites**
- Prévoir des générateurs de données fictives réalistes mais non réelles.
- Revue systématique avant tout partage d'environnement ou de capture.
