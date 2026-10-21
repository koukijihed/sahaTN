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
| HEAD local | `9cc210de` (contrôle du seed, garde-fou, build Render) |
| `origin/main` | `9cc210de` (à jour — poussé) |
| Client Git | Git 2.55 (`C:\Program Files\Git\bin`) |
| Auth | `gh` CLI 2.102 **authentifié** (`koukijihed`, scopes `repo`,`workflow`,`gist`,`read:org`) ; helper `manager` |
| Travail non versionné | aucun commit en attente ; dossiers de build ignorés — `.gitignore` corrigé (UTF-8) |

**Historique** : `d5c4e46b` (plateforme initiale) → `54d91bef` (blueprint Render
backend-only, suppression du `vercel.json` racine obsolète) → `beba9848` (audit
complet + préparation déploiement) → `35a7dad1` (remédiation post-audit, seed de
démo, runbook de déploiement) → `13d4f163` (readiness/README) → `9cc210de`
(seed contrôlé, garde-fou, build Render).

---

## 1bis. État de déploiement vérifié (2026-10-21, outils réels)

| Composant | État vérifié | Détail |
| --- | --- | --- |
| **GitHub** | DONE | `main` @ `9cc210de`, arbre propre, dépôt **PUBLIC** (inchangé, non autorisé à passer privé) |
| **Neon** | DONE | Projet dédié **`sahatn-demo`** créé (eu-central-1, PG 18) ; 9 migrations appliquées ; seed synthétique chargé et **vérifié** : users 5, doctors 2, facilities 24, specialties 36, appointments 5, events 11, records 2, encounters 1, documents 3, notifications 2 |
| **Render** | **BLOCKED** | Aucun CLI/API key ; `https://sahatn-backend.onrender.com` renvoie **404** → service inexistant. Création dashboard par l'opérateur requise |
| **Vercel** | PARTIEL | Projet `sahatn` **live** : `https://sahatn.vercel.app` → **HTTP 200** (build démo, CSP présente), racine `frontend`, dépôt GitHub **déjà connecté**. Mais `API_URL` pointe vers le backend Render **inexistant** → appels API en échec |
| **Stockage documents** | Limitation | Éphémère sur Render ; plan S3-compatible : [PLAN-stockage-objet-documents.md](PLAN-stockage-objet-documents.md) |

---

## 2. Fichiers de déploiement : rôle et statut

| Fichier | Suivi Git | Rôle | Autorité |
| --- | --- | --- | --- |
| `render.yaml` (racine) | Oui | Blueprint Render **backend uniquement** (plan gratuit, migrations au build, **seed non automatique**, health `/api/health`) | **Autoritatif** pour le backend |
| `vercel.json` (racine) | **Supprimé** en `54d91bef` | Ancienne config obsolète (redirection locale) ; remplacée par la détection automatique Vercel | Non autoritatif (retiré volontairement) |
| `docs/DEPLOYMENT.md` | Oui | **Runbook de déploiement** (Neon → Render → Vercel) | Documentaire (à suivre) |
| `deploy.ps1` (racine) | Oui | Script **local** « production-like » (Postgres embarqué 55435, `node dist/main` + `next start`) | Outil local, **pas** un artefact cloud |
| `docker-compose.yml` | Oui | Postgres de développement | Local uniquement |
| `backend/Dockerfile`, `frontend/Dockerfile` | Oui | Images conteneur (alternative) | Optionnel |
| `infra/README.md` | Oui | Notes infra (placeholder) | Documentaire |
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

- Backend : lint/typecheck 0, **204 tests unitaires**, **121 tests e2e** ;
  build de production OK.
- Frontend : lint/typecheck 0, **43 tests Playwright** ; build de production OK.
- Backend déployable sans état local obligatoire (hors documents) : sessions en
  base, auth contextuelle, CSRF, rate limiting, Swagger désactivé en prod.
- `render.yaml` cohérent avec l'architecture (backend-only, migrations au build
  **sans seed automatique**, health check, env vars documentées,
  `ENABLE_API_DOCS=false`).
- En-têtes de sécurité durcis côté backend (CSP, X-Frame-Options: deny, CORP,
  referrer-policy) et frontend (CSP compatible hydratation Next.js).
- Migrations revues : 9 migrations, déclencheurs d'immuabilité inclus.
- Seed de démonstration **idempotent** (5 utilisateurs, 2 médecins, 5
  rendez-vous, dossiers/documents synthétiques) et **protégé par un garde-fou
  opt-in** (`SAHATN_DEMO_SEED=1`) : il refuse de s'exécuter sur une base non
  désignée — voir [DEMO_MODE.md](DEMO_MODE.md) et [DEPLOYMENT.md](DEPLOYMENT.md) §2.
- `.env` non suivi ; aucun secret détecté dans les fichiers suivis.
- Tableau des variables d'environnement par service fourni ([DEPLOYMENT.md](DEPLOYMENT.md) §4).

## 5. Bloqueurs et éléments manuels

| ID | Bloqueur | Type | Action requise |
| --- | --- | --- | --- |
| READY-1 | ~~Base PostgreSQL managée inexistante~~ **RÉSOLU** | — | Projet Neon `sahatn-demo` créé, migré et seedé (voir §1bis) |
| READY-2 | `CORS_ORIGIN` (Render) / `API_URL` (Vercel) à aligner | Config | Après création Render : `API_URL` Vercel = URL Render, puis `CORS_ORIGIN` Render = `https://sahatn.vercel.app`, puis redéploiement |
| READY-3 | Service Render non créé | Manuel (compte) | Créer le service via le blueprint `render.yaml` (dashboard) ; définir `DATABASE_URL` (Neon) et `CORS_ORIGIN` |
| READY-4 | ~~Projet Vercel non créé~~ **PARTIEL** | — | Projet `sahatn` existe et est live (`https://sahatn.vercel.app`), dépôt déjà connecté ; reste à corriger `API_URL` (READY-2) |
| READY-5 | Contenu des documents non persistant (stockage local sur FS éphémère Render) | Code | Limitation **documentée** ; plan S3-compatible : [PLAN-stockage-objet-documents.md](PLAN-stockage-objet-documents.md) — DEP-5 |
| READY-6 | `Secure` cookies dépend de `NODE_ENV` sans `trust proxy` | Code/config | `secure` est piloté par `NODE_ENV=production` (et non `req.secure`) → correct derrière le proxy TLS ; DEP-2 |
| READY-7 | MFA/2FA et chiffrement au repos non implémentés | Code (P0) | Reste ouvert ; prototype **démo uniquement** (STEP 3) |
| READY-9 | Visibilité dépôt = PUBLIC | Manuel (compte) | **Opérateur a choisi de rester PUBLIC** ; risque documenté (données 100 % synthétiques) |

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
| 2026-10-21 | Post-audit : en-têtes de sécurité (SEC-5/SEC-6), bandeau de démo (STEP 3), seed complet idempotent (STEP 4 DONE), runbook [DEPLOYMENT.md](DEPLOYMENT.md). `render.yaml` exécute désormais le seed au build. READY-8 résolu. Compteurs de tests actualisés : unit 204, e2e 121, Playwright 43. |
| 2026-10-21 | **Seed retiré du build Render** : migrations seules au build ; seed = action explicite contrôlée. **Garde-fou seed** (`SAHATN_DEMO_SEED=1`, sinon refus sans écriture) + événement d'audit `ACCESS_DENIED` rendu idempotent. Limitation du stockage documents explicitée ; tableau de variables d'environnement et vérifications post-déploiement ajoutés ([DEPLOYMENT.md](DEPLOYMENT.md)). |
| 2026-10-21 | **Déploiement : état réel inspecté** (neonctl/vercel CLI/gh). Projet Neon **`sahatn-demo`** créé + migré + seedé (compteurs vérifiés). Vercel `sahatn` **live** (`https://sahatn.vercel.app`, HTTP 200). Render **absent** (404). READY-1 résolu, READY-4 partiel, READY-3 bloque. Plan stockage objet ajouté ([PLAN-stockage-objet-documents.md](PLAN-stockage-objet-documents.md)). |
