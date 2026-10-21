# ADR-0015 — Posture de sécurité du prototype public de démonstration

- **Statut** : Accepté
- **Date** : Jour 17 (post-audit)

## Contexte

L'[audit complet](../SAHATN_COMPLETE_AUDIT.md) a confirmé un socle solide
(autorisation contextuelle, journal d'audit *append-only* scellé en base,
validation stricte, export FHIR R4 validé) **et** identifié des écarts de
production non résolus, dont deux **critiques (P0)** :

- **SEC-1** : absence de MFA/2FA pour les comptes privilégiés
  (`DOCTOR`, `ADMIN`, `FACILITY_STAFF`) ;
- **SEC-2** : absence de chiffrement au repos du contenu des documents médicaux
  et des sauvegardes.

Et des écarts **élevés (P1)** : pas d'antivirus sur les pièces jointes (SEC-3),
pas de revue outillée/alerte des accès d'urgence (SEC-4), sauvegardes non
exercées (READY), stockage documentaire local non adapté au multi-instance
(DEP-5), politique de rétention/suppression non définie (DATA-1).

Or le projet doit être **exposé publiquement sur Internet** à des fins de
démonstration. Il faut donc décider **sous quelles conditions** une exposition
est acceptable **sans** donner l'illusion d'un service de santé opérationnel.

## Décision

### 1. Le prototype public est un environnement de démonstration, pas un service de santé

Le déploiement public est explicitement étiqueté **« démonstration »** :

- bandeau visible sur **toutes** les pages (`DemoBanner`) ;
- page `/demo` décrivant les limites et les comptes synthétiques ;
- métadonnées et pied de page rappelant « données fictives, ne pas utiliser pour
  des soins ».

### 2. Données synthétiques uniquement

Aucune donnée réelle de patient, aucun document médical réel, aucun identifiant
sanitaire réel. Le jeu de démonstration est **généré** et **idempotent**
(ADR-0007, [DEMO_MODE](../DEMO_MODE.md)). Les comptes de démonstration utilisent
la **vraie logique de hachage** (Argon2id) et sont **isolés** des données issues
de l'inscription publique.

### 3. Les contrôles P0/P1 non opérationnels ne sont pas revendiqués

Aucune fonctionnalité ne doit être présentée comme « sécurisée » ou
« conforme ». Tant que SEC-1 à SEC-4 et DATA-1 ne sont pas implémentés **et**
testés, ils restent listés comme **ouverts** dans la documentation. Aucune
conformité réglementaire n'est considérée comme acquise sans validation
juridique indépendante.

### 4. Restrictions appliquées au prototype public

- **Aucun compte administrateur publié** : les identifiants admin ne figurent ni
  dans le seed public ni sur la page `/demo`.
- **Comptes de démonstration non privilégiés** : patient, médecin vérifié,
  personnel d'établissement — tous synthétiques.
- **Réinitialisation** : la base de démonstration peut être réinitialisée à tout
  moment ; ne jamais y saisir d'information réelle.
- **Journalisation minimisée** : les erreurs ne reflètent ni *query string* ni
  donnée sensible (SEC-6 corrigé ; test unitaire dédié).
- **En-têtes durcis** : CSP explicite + en-têtes de sécurité, **testés** via la
  pile de middlewares réelle (SEC-5).

### 5. Écarts ouverts, suivis comme dette

| ID | Sujet | Statut |
| --- | --- | --- |
| SEC-1 | MFA/2FA comptes privilégiés | **Ouvert** (bloque tout usage réel) |
| SEC-2 | Chiffrement au repos (documents, sauvegardes) | **Ouvert** (bloque tout usage réel) |
| SEC-3 | Antivirus pièces jointes | **Ouvert** |
| SEC-4 | Revue/alerte accès d'urgence | **Ouvert** |
| DATA-1 | Rétention/suppression/anonymisation | **Ouvert** ; durées légales **à définir par un juriste** (jamais inventées) |
| SEC-3/DEP-5 | Stockage objet externe privé | **Ouvert** ; limitation assumée en démo mono-instance |

## Conséquences

**Avantages**
- Le prototype peut être démontré publiquement **honnêtement**, sans donner
  l'illusion d'un service clinique.
- Les limites sont **explicites et traçables** ; aucune revendication de sécurité
  non étayée.
- L'isolation des comptes de démonstration protège les données d'inscription
  réelles (fictives) des manipulations de démo.

**Limites**
- Le prototype **n'est pas** apte à un usage clinique réel, ni à des données
  réelles, tant que SEC-1/SEC-2 ne sont pas livrés.
- Le stockage documentaire local impose une **instance unique** pour la démo.

**Suites**
- MFA/2FA (SEC-1) et chiffrement au repos (SEC-2) : **priorité d'industrialisation**.
- Antivirus, revue d'urgence, sauvegardes restaurées, stockage objet : Phase
  d'industrialisation (voir [`../roadmap.md`](../roadmap.md)).

## Références

- Audit : [`../SAHATN_COMPLETE_AUDIT.md`](../SAHATN_COMPLETE_AUDIT.md)
- Préparation au déploiement : [`../SAHATN_DEPLOYMENT_READINESS.md`](../SAHATN_DEPLOYMENT_READINESS.md)
- Mode démo : [`../DEMO_MODE.md`](../DEMO_MODE.md)
- Sécurité : [`../security.md`](../security.md)
- Données fictives : [ADR-0007](0007-donnees-fictives.md)
- Stockage documents : [ADR-0013](0013-stockage-documents-medicaux.md)
