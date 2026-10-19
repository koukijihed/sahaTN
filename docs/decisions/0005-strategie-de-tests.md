# ADR-0005 — Stratégie de tests

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

Un système de santé ne tolère pas les régressions silencieuses, en particulier sur les
règles d'accès et la traçabilité. Les tests doivent couvrir la logique métier **et** la
sécurité.

## Décision

Trois niveaux de tests :

1. **Unitaires** (Jest) : logique métier et règles d'autorisation isolées.
2. **Intégration** (Jest + Supertest + PostgreSQL de test) : de la requête HTTP jusqu'à la
   base de données.
3. **E2E** (à évaluer, ex. Playwright) : parcours critiques de bout en bout.

Priorité donnée aux **tests de sécurité** : contrôle d'accès (positif et négatif),
génération d'audit, validation d'entrées, limitation de débit.

## Alternatives considérées

- Tests manuels seulement : rejeté (non reproductible, non continu).
- Seulement des tests e2e : rejeté (lents, diagnostic difficile).

## Conséquences

**Avantages**
- Détection précoce des régressions ; confiance dans les évolutions.
- Les exigences de sécurité deviennent vérifiables.

**Limites**
- Temps de mise en place initial (CI, base de test).

**Suites**
- Mettre en place la CI : lint + typecheck + tests + build.
- Interdire la présentation d'une fonctionnalité comme « sécurisée » sans tests.
