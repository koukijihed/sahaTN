# ADR-0004 — Autorisation contextuelle des données médicales

- **Statut** : Accepté
- **Date** : Jour 1

## Contexte

Un modèle RBAC classique (rôle → permission) est nécessaire mais **insuffisant** : être
« médecin » ne signifie pas avoir le droit de lire **n'importe quel** dossier patient.
Une authentification réussie n'autorise pas l'accès à un dossier médical.

## Décision

Combiner plusieurs niveaux d'autorisation, **appliqués côté serveur** :

1. **RBAC** : rôle et permissions fonctionnelles.
2. **Contrôle par objet** : vérifier que l'acteur a un droit sur **cet** objet précis
   (lutte contre les accès directs non autorisés / IDOR).
3. **Contexte clinique** : existence d'une base d'accès — relation de soin active,
   consentement du patient, ou accès d'urgence encadré.

## Alternatives considérées

- RBAC seul : rejeté (fuite de dossiers non nécessaires au soin).
- Règles uniquement côté frontend : rejeté (non fiable).

## Conséquences

**Avantages**
- Moindre privilège réel sur les données médicales.
- Conformité au principe « pas d'accès sans base légale ».

**Limites**
- Logique d'autorisation plus complexe à développer et tester.
- Nécessite un modèle de consentement/relations explicite.

**Suites**
- Implémenter un moteur de règles d'autorisation testable.
- Tester systématiquement les cas négatifs (accès refusé).
