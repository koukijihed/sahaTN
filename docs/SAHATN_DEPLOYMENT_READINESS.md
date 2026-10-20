# SahaTN — État de préparation au déploiement

> **Statut** : document de suivi, mis à jour le 2026-10-21.
> Objet : rendre explicite ce qui est **prêt**, ce qui **bloque**, et ce qui
> reste **manuel** avant d'exposer le prototype sur Internet.
> Aucune donnée réelle. Prototype de **démonstration à données synthétiques
> uniquement** (voir [DEMO_MODE.md](DEMO_MODE.md)).

---

## 1. État Git (inspecté le 2026-10-21)

| Élément | Valeur |
| --- | --- |
| Dépôt | `https://github.com/koukijihed/sahaTN` (visibilité **PUBLIC**) |
| Branche | `main` (seule branche ; pas de stash) |
| HEAD local | `54d91bef` |
| `origin/main` | `54d91bef` (à jour — **rien à pousser hors nouveau travail**) |
| Client Git | Git 2.55 (`C:\Program Files\Git\bin`) |
| Auth | `gh` CLI 2.102 **authentifié** (`koukijihed`, scopes `repo`,`workflow`,`gist`,`read:org`) ; helper `manager` |
| Travail non versionné | `docs/SAHATN_COMPLETE_AUDIT.md` (nouveau) ; dossiers de build ignorés (`node_modules/`, `dist/`, `.next/`, `.dev-postgres/`) ; `frontend/.gitignore`, `tsconfig.tsbuildinfo` |

**Historique** : `d5c4e46b` (plateforme initiale) → `54d91bef` (blueprint Render
backend-only, suppression du `vercel.json` racine obsolète).

---

## 2. Fichiers de déploiement : rôle et statut

| Fichier | Suivi Git | Rôle | Autorité |
| --- | --- | --- | --- |
| `render.yaml` (racine) | Oui | Blueprint Render **backend uniquement** (plan gratuit, migrations au build, health `/api/health`) | **Autoritatif** pour le backend |
| `vercel.json` (racine) | **Supprimé** en `54d91bef` | Ancienne config obsolète (redirection locale) ; remplacée par la détection automatique Vercel | Non autoritatif (retiré volontairement) |
| `deploy.ps1` (racine) | Oui | Script **local** « production-like » (Postgres embarqué 55435, `node dist/main` + `next start`) | Outil local, **pas** un artefact cloud |
| `docker-compose.yml` | Oui | Postgres de développement | Local uniquement |
| `backend/Dockerfile`, `frontend/Dockerfile` | Oui | Images conteneur (alternative) | Optionnel |
| `infra/README.md` | Oui | Notes infra (placeholder) | Documentaire |
| `.gitignore.tmp` | Oui | **Résidu accidentel** (contient une seule ligne `node_modules`) | À retirer de Git |
| `docs/neon.md` | Oui | Guide PostgreSQL managé (Neon) | Documentaire |

**Décision d'autorité** : le déploiement cloud retenu est
**frontend Vercel + backend Render, base PostgreSQL managée externe**. Le
`render.yaml` racine est le fichier de référence pour le backend. `deploy.ps1`
reste l'outil de vérification locale.

---

## 3. Architecture de déploiement visée

```
Navigateur
   │  HTTPS
   ▼
Vercel (Next.js)  ──rewrite /api/:path*──►  Render (NestJS, /api)
   │                                              │
   │                                              ▼
   └── cookies HttpOnly/SameSite=Lax ◄──   PostgreSQL managé (Neon)
                                                 │
                                                 ▼
                                    Stockage documents (adapter)
```

- **Frontend** : Vercel, racine de projet `frontend/`, build `next build`,
  variable `API_URL` = URL publique du backend.
- **Backend** : Render (Node), racine `backend/`, build + `prisma migrate deploy`,
  `start:prod`, health `/api/health`.
- **Base** : PostgreSQL managé (Neon) via `DATABASE_URL` **avec `?sslmode=require`**.
- **Stockage documents** : le stockage local sur disque n'est pas fiable
  multi-instance ; un **adapter d'objet externe** est requis pour un usage
  cloud durable (voir §5, DEP-5).

---

## 4. Ce qui est PRÊT (vérifié)

- Backend : lint/typecheck 0, **201 tests unitaires**, **117 tests e2e** ;
  build de production OK.
- Frontend : lint/typecheck 0, **42 tests Playwright** ; build de production OK.
- Backend déployable sans état local obligatoire (hors documents) : sessions en
  base, auth contextuelle, CSRF, rate limiting, Swagger désactivé en prod.
- `render.yaml` cohérent avec l'architecture (backend-only, migrations au build,
  health check, env vars documentées, `ENABLE_API_DOCS=false`).
- Migrations revues : 9 migrations, déclencheurs d'immuabilité inclus.
- Seed idempotent (upserts) — à étendre pour la démo complète (STEP 4).
- `.env` non suivi ; aucun secret détecté dans les fichiers suivis.

## 5. Bloqueurs et éléments manuels

| ID | Bloqueur | Type | Action requise |
| --- | --- | --- | --- |
| READY-1 | Base PostgreSQL managée inexistante | Manuel (compte) | Créer un projet Neon, récupérer `DATABASE_URL` avec `?sslmode=require` |
| READY-2 | `CORS_ORIGIN` / `API_URL` non renseignés | Config | Renseigner l'URL Vercel côté Render et l'URL Render côté Vercel **après** déploiement |
| READY-3 | Service Render non créé | Manuel (compte) | Créer le service via le blueprint `render.yaml` |
| READY-4 | Projet Vercel non créé | Manuel (compte) | Importer le dépôt GitHub sur Vercel, racine `frontend/` |
| READY-5 | Stockage documents local non partagé | Code | Adapter d'objet externe (S3-compatible) — DEP-5 |
| READY-6 | `Secure` cookies dépend de `NODE_ENV` sans `trust proxy` | Code/config | Vérifier le proxy TLS ; DEP-2 |
| READY-7 | MFA/2FA et chiffrement au repos non implémentés | Code (P0) | Reste ouvert ; prototype **démo uniquement** (STEP 3) |
| READY-8 | `.gitignore.tmp` suivi par erreur | Hygiène | Retirer du suivi Git |
| READY-9 | Visibilité dépôt = PUBLIC (non demandée) | Manuel (compte) | Passer en privé sauf autorisation explicite |

---

## 6. Régime de sécurité du prototype

**Le prototype public doit rester en « mode démonstration »** :

- Données **100 % synthétiques** (ADR-0007, [DEMO_MODE.md](DEMO_MODE.md)).
- Aucune donnée réelle de patient, aucun document médical réel.
- MFA, chiffrement au repos, antivirus et sauvegardes **non opérationnels** à ce
  stade → **pas d'usage clinique réel**, **pas de revendication de conformité**.
- Bandeau de démonstration visible côté UI (STEP 3).

---

## 7. Journal des mises à jour

| Date | Événement |
| --- | --- |
| 2026-10-21 | Création du document. Git inspecté (`main` = `54d91bef`, à jour). `gh` authentifié. Autorité des fichiers de déploiement clarifiée. Bloqueurs READY-1..9 identifiés. |
