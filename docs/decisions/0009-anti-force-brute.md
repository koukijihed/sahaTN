# ADR-0009 — Anti-force brute et limitation de débit

- **Statut** : Accepté
- **Date** : Jour 2

## Contexte

Les comptes d'authentification sont une cible d'attaques par force brute et par
« credential stuffing ». Un système de santé doit ralentir ces attaques sans créer de
déni de service ni bloquer durablement des utilisateurs légitimes.

## Décision

Deux mécanismes complémentaires, **configurables par variables d'environnement** :

1. **Verrouillage progressif par compte** —
   - chaque échec de connexion incrémente `failedLoginAttempts` sur l'utilisateur ;
   - au-delà de `LOGIN_MAX_ATTEMPTS` (défaut : 5) échecs, le compte est verrouillé
     pendant `LOGIN_LOCK_MINUTES` (défaut : 15) via `lockedUntil` ;
   - une connexion réussie remet le compteur à zéro ;
   - l'utilisateur est informé par une réponse explicite (`429`), sans divulguer si
     l'email existe ou non (message identique aux autres échecs).

2. **Limitation de débit par IP** (NestJS `Throttler`) —
   - limite globale `THROTTLE_LIMIT` (défaut : 100 req/min) ;
   - limites resserrées pour la connexion et l'inscription
     (`LOGIN_THROTTLE_LIMIT`, `REGISTER_THROTTLE_LIMIT`).

Les seuils sont volontairement **injectés par l'environnement** afin que les tests
puissent les neutraliser sans désactiver le code de sécurité (les tests e2e fixent des
limites très hautes, ils n'enlèvent pas la protection).

## Alternatives considérées

- **CAPTCHA dès la première tentative** : rejeté (atteinte à l'accessibilité, protection
  amont au backend).
- **Blocage définitif du compte** : rejeté (vecteur de déni de service sur les comptes
  légitimes).
- **Verrouillage par IP uniquement** : rejeté seul (contournable, et punit des
  utilisateurs partageant une IP).

## Conséquences

**Avantages**
- Freine efficacement le bourrage d'identifiants et la force brute.
- Seuils ajustables par environnement et **testés** (scénario de verrouillage).

**Limites**
- Un attaquant peut verrouiller temporairement un compte qu'il connaît (atténué par la
  durée courte et la remise à zéro sur succès).

**Suites**
- Envisager une journalisation des verrouillages pour l'audit (Phase 7).
- Étudier des listes de mots de passe compromis pour l'inscription.
