# ADR-0008 — Sessions opaques en base et protection CSRF

- **Statut** : Accepté
- **Date** : Jour 2

## Contexte

L'authentification doit reposer sur un mécanisme de session sûr pour une application web
sans `localStorage` (les données de santé ne doivent pas être exposées au JavaScript de
la page, et une session volée doit pouvoir être révoquée). Les attaques CSRF sur les
actions à état (déconnexion, futures actions métier) doivent être bloquées.

## Décision

- **Jeton de session opaque** : un identifiant aléatoire de 32 octets (encodage
  `base64url`) est généré côté serveur. Seul son **hachage SHA-256** est stocké dans la
  table `Session`. Le jeton en clair n'existe que dans le cookie du client, jamais en
  base ni dans les logs.
- **Cookie de session** `sahatn_session` : `HttpOnly`, `SameSite=Lax`, `Secure` hors
  développement, `Path=/`. Il n'est **jamais** accessible au JavaScript du navigateur.
- **Révoquation** : la déconnexion positionne `revokedAt` sur la session courante ;
  l'expiration (`expiresAt`) et la révocation sont vérifiées à chaque requête.
- **Protection CSRF « double-submit »** : un second cookie `sahatn_csrf` (non `HttpOnly`,
  aléatoire) est émis, et le client doit renvoyer sa valeur dans l'en-tête `x-csrf-token`
  pour toute requête modifiant l'état. Le serveur compare cookie et en-tête.
- **Amorçage sans CSRF** : `POST /api/auth/register` et `POST /api/auth/login` sont
  exemptés de la vérification CSRF (aucune session n'existe encore) ; les actions
  authentifiées (ex. `POST /api/auth/logout`) sont protégées.
- **Vérification d'origine** : toute requête à état dont l'en-tête `Origin` est présent
  doit correspondre à une origine autorisée (`CORS_ORIGIN`), sinon elle est rejetée.

## Alternatives considérées

- **JWT signés sans état** : rejeté — la révocation immédiate est complexe à mettre en
  œuvre et un jeton volé reste valide jusqu'à expiration.
- **Jeton en `localStorage`** : rejeté — exposé au XSS, inacceptable pour des données de
  santé.
- **Uniquement `SameSite` sans jeton CSRF** : rejeté seul — insuffisant comme unique
  défense en profondeur.

## Conséquences

**Avantages**
- Révocation serveur immédiate ; aucune donnée sensible côté client.
- Défense CSRF en profondeur (cookie + en-tête + vérification d'origine).
- Le jeton n'apparaît jamais dans les journaux ni dans les URL.

**Limites**
- Une lecture en base par requête authentifiée (mitigée par index sur `tokenHash`).
- Nécessite une coordination cookie/en-tête côté client (implémentée dans
  `frontend/lib/api.ts`).

**Suites**
- Rotation du jeton de session à la connexion sensible (à ajouter).
- MFA pour les comptes professionnels et administratifs (Phase 1, cible).
