# CI/CD et tests automatisés (SahaTN)

## 1. Objectifs
- Garantir qu'aucune régression n'est introduite (règles sécurité, accès, intégrité).
- Ne jamais exécuter avec de vraies données ou de vrais secrets.
- Échouer tôt si la configuration est invalide.
- Documenter ce qui s'exécute en CI vs localement.

## 2. Contrôles backend

| Contrôle | Commande en CI | Équivalent local |
| --- | --- | --- |
| Dépendances | `npm ci` | `npm ci` |
| Client Prisma | `npx prisma generate` | `npm run prisma:generate` |
| Analyse statique | `npm run lint` | `npm run lint` |
| Types | `npm run typecheck` | `npm run typecheck` |
| Build | `npm run build` | `npm run build` |
| Migrations | `npx prisma migrate deploy` | incluses dans `npm run test:e2e` |
| Validation d'env (valide) | `node dist/main.js` avec `PORT` numérique | `node dist/main.js` non applicable |
| Validation d'env (invalide) | échec attendu, nommant `PORT` | voir §5 |
| Tests unitaires | `npm test -- --maxWorkers=1 --no-coverage` | `npm test` |
| Tests e2e | `npx jest --config ./test/jest-e2e.json --runInBand --no-coverage` | `npm run test:e2e` |
| Audit des dépendances | `npm audit --omit=dev --audit-level=high` (informatif, non bloquant) | `npm audit --omit=dev` |

- **Audit des dépendances** : exécuté à titre **informatif** (les vulnérabilités connues des
  dépendances de production sont signalées sans bloquer la fusion tant que la remédiation
  n'est pas planifiée). Il ne remplace pas une veille de sécurité dédiée (voir §6).
- **Base de test** : le job backend utilise un **service PostgreSQL 16** isolé
  (`sahatn_test`, identifiants **fictifs** `postgres/postgres`) avec healthcheck
  `pg_isready`. Aucune base réelle ni donnée personnelle n'est utilisée.
- **Échec dur** : une migration, une initialisation ou un contrôle obligatoire en échec
  fait échouer le job. Aucun test réel n'est remplacé par un mock pour « faire passer » la CI.
- **Variables de test** : `NODE_ENV=test`, limites de débit élevées, `CORS_ORIGIN` —
  toutes fictives et non sensibles.

## 3. Contrôles frontend et navigateur

| Contrôle | Commande en CI | Équivalent local |
| --- | --- | --- |
| Dépendances | `npm ci` | `npm ci` |
| Analyse statique | `npm run lint` | `npm run lint` |
| Types | `npm run typecheck` | `npm run typecheck` |
| Build (avec API_URL) | `npm run build` | `API_URL=http://localhost:4000 npm run build` |
| Install navigateur | `npx playwright install --with-deps chromium` | `npx playwright install chromium` |
| Tests Playwright + axe-core | `npx playwright test --project=chromium` | `npm run test:e2e` |

- Les tests navigateur démarrent automatiquement un backend + frontend de production
  (données fictives, PostgreSQL embarqué). Aucune donnée réelle.
- **Artefacts** : `playwright-report` et `test-results` sont téléversés en cas d'échec
  pour faciliter le diagnostic.

## 3bis. Tests Playwright (fonctionnement)

- `frontend/playwright.config.ts` : un seul projet `chromium`, workers=1, timeouts stricts.
- Démarrage automatique : backend (`test/browser/start-server.mjs`) avec PostgreSQL embarqué
  (port 55433 par défaut), migrations + seed fictifs, puis `next start` sur 3100.
- BaseURL `http://localhost:3100`. Accès en lecture seule et opérations avec permissions
  vérifiées.
- `axe-core` injecté dans les scénarios d'accessibilité.
- `reuseExistingServer: false` en CI, `trace/screenshot` sur échec uniquement.

## 4. Prérequis des tests e2e
- PostgreSQL non requis localement (embarquée). Pour cibler une base externe :
  `TEST_DATABASE_URL=postgresql://user:pass@host:5432/db_name npm run test:e2e`
  (migrations déployées sur cette base).
- Le backend doit pouvoir créer/supprimer ses tables + triggers (`migrate deploy` utilisé).
- Aucun réseau externe requis.

## 5. Validation d'environnement
- `backend/src/config/env.validation.ts` rejette les valeurs **invalide** (PORT 'abc', etc.)
  sans retomber sur une valeur par défaut.
- Scénario CI : compilation → tentative `NODE_ENV=production PORT=abc node dist/main.js`
  → sortie contient `PORT` et code ≠ 0.
- Cas valides : `PORT=4000` accepté ; entiers stricts uniquement.

## 6. Bonnes pratiques sécurité/qualité
- Jamais de secrets dans le dépôt. `.env` ignoré. `github/workflows/ci.yml` n'expose
  aucun secret.
- Données de démonstration uniquement (fictives) — conformes à ADR-0007.
- Pas de contournement de garde-fous pour faire passer la CI.
- Swagger est **désactivé par défaut en production** (`ENABLE_API_DOCS=false`). Peut être
  activé explicitement hors production ou si forcé.
- Déploiement : pas de `docker push` ; `docker build` non exécuté en CI.

## 7. Déploiement (aperçu)
- Prévu via **Render Blueprint** (`render.yaml`) ou **Vercel** (`vercel.json`).
- Aucun déploiement automatique depuis CI. Les fichiers de déploiement sont présents
  pour faciliter l'hébergement (demo fictive) sans exposition involontaire.

## 8. Fichiers associés
- `.github/workflows/ci.yml` — workflow complet
- `backend/scripts/run-e2e.mjs` — lanceur e2e (base embarquée)
- `frontend/playwright.config.ts` — configuration navigateur
- `backend/test/browser/start-server.mjs` — serveur browser tests
- `backend/src/config/env.validation.ts` — validation stricte
- `render.yaml` / `vercel.json` — Blueprints de déploiement
