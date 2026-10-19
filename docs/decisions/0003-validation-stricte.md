# ADR-0003 — Validation stricte côté serveur

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

Les données de santé attirent des entrées malveillantes ou erronées. Le typage
TypeScript disparaît à l'exécution : il ne protège pas contre des données invalides
provenant d'un client.

## Décision

- Valider **toutes** les entrées côté serveur via des DTO et des schémas.
- Activer une **whitelist** : rejeter les champs non déclarés.
- **Interdire les payloads non conformes** plutôt que les nettoyer silencieusement.
- Ne jamais accorder de confiance à la validation côté client.

## Alternatives considérées

- Validation uniquement côté client : rejetée (contournable trivialement).
- Validation manuelle dispersée : rejetée (source d'oublis et d'incohérences).

## Conséquences

**Avantages**
- Surface d'attaque réduite ; comportements prévisibles.
- Meilleure qualité de données.

**Limites**
- Duplication nécessaire des règles entre client et serveur (assumée).

**Suites**
- Tests dédiés au rejet d'entrées invalides.
- Documenter les schémas d'API (OpenAPI).
