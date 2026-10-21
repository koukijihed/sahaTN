# Guide de déploiement — SahaTN (prototype de démonstration)

> **Prototype de démonstration à données synthétiques uniquement** (ADR-0007,
> ADR-0015, [DEMO_MODE.md](DEMO_MODE.md)). Aucune donnée médicale réelle.
> **Pas d'usage clinique réel**, pas de revendication de conformité.

Cible : **frontend Vercel + backend Render + PostgreSQL managé (Neon)**.
Certaines étapes exigent des **comptes externes** et une intervention manuelle :
elles ne peuvent pas être automatisées depuis le dépôt. **Aucune étape ci-dessous
n'est réputée faite tant que les URLs publiques ne répondent pas aux vérifications
de la §7.**

---

## 1. Architecture

```
Navigateur ──HTTPS──► Vercel (Next.js, racine frontend/)
                          │  rewrite same-origin /api/:path* → API_URL
                          ▼
                     Render (NestJS, racine backend/, /api)
                          │
                          ▼
                     PostgreSQL managé (Neon)  +  stockage documents (local, éphémère)

Cookies de session : HttpOnly, SameSite=Lax, Secure (NODE_ENV=production),
host-only (COOKIE_DOMAIN vide) — posés sur l'origine du frontend via le proxy.
```

---

## 2. Politique de migrations et de seed (contrôlée)

- **Migrations** : `npx prisma migrate deploy` s'exécute **au build** Render. Les
  migrations sont versionnées (9 migrations) et idempotentes par nature. Aucune
  donnée n'est introduite par une migration.
- **Seed de démonstration** : **jamais** exécuté automatiquement au build ni au
  démarrage. Il s'exécute **à la demande**, en tant qu'étape explicite contrôlée,
  et **uniquement** sur une base de démonstration désignée.
- **Garde-fou code** (`backend/prisma/seed.mjs`) : le seed **refuse par défaut**
  de s'exécuter. Il ne se lance que si :
  - `SAHATN_DEMO_SEED=1` (ou `true`/`yes`) — opt-in explicite ; **ou**
  - `NODE_ENV=test` — harnais e2e/navigateur sur base jetable.

  Sans l'une de ces conditions, le seed s'arrête avec un code de sortie non nul
  **sans écrire aucune donnée**. Cela protège notamment `NODE_ENV=production` :
  même avec `DATABASE_URL` renseigné, aucun seed ne se déclenche.
- **Idempotence** : le seed n'utilise que des `upsert` et des gardes
  `findFirst`/`findUnique`. En particulier l'événement d'audit `ACCESS_DENIED`
  (table **append-only**) n'est créé que s'il n'existe pas déjà, afin de ne pas
  empiler de doublons d'audit à chaque exécution.

> **Pourquoi ce changement** : exécuter `npx prisma db seed` à chaque build
> écrivait sur la base à chaque redéploiement et ne garantissait pas que la base
> cible soit bien une base de démonstration. Le seed est désormais une action
> opérateur explicite.

---

## 3. Prérequis

- Dépôt GitHub `koukijihed/sahaTN` (branche `main`).
- Comptes : GitHub, Vercel, Render, Neon.
- Aucun secret n'est committé : tout passe par les variables d'environnement.

---

## 4. Tableau des variables d'environnement

`S` = **secret** (ne jamais publier ni committer). « Source de la valeur » indique
où l'opérateur récupère la valeur réelle — **aucune valeur réelle n'est fournie
ici**.

| Variable | Service | S | Source de la valeur |
| --- | --- | --- | --- |
| `DATABASE_URL` | Render (backend) | **S** | Console Neon → *Connection string* (ajouter `?sslmode=require`) |
| `NODE_ENV` | Render | Non | Fixe : `production` |
| `SAHATN_DEMO_SEED` | Render | Non | Fixe `"0"` ; passer à `"1"` **uniquement** pendant le seed contrôlé (§6) |
| `API_PREFIX` | Render | Non | Fixe : `api` |
| `CORS_ORIGIN` | Render | Non | URL publique Vercel (ex. `https://<projet>.vercel.app`) |
| `ENABLE_API_DOCS` | Render | Non | Fixe : `false` (Swagger désactivé en prod) |
| `SESSION_COOKIE_NAME` | Render | Non | Fixe : `sahatn_session` |
| `CSRF_COOKIE_NAME` | Render | Non | Fixe : `sahatn_csrf` |
| `SESSION_TTL_SECONDS` | Render | Non | Fixe : `604800` |
| `COOKIE_DOMAIN` | Render | Non | Vide (cookie host-only via proxy) |
| `LOGIN_MAX_ATTEMPTS` | Render | Non | Fixe : `5` |
| `LOGIN_LOCK_MINUTES` | Render | Non | Fixe : `15` |
| `DOCUMENT_MAX_FILE_BYTES` | Render | Non | Fixe : `5242880` |
| `DOCUMENT_STORAGE_DIR` | Render | Non | Vide par défaut (éphémère — voir §5) |
| `API_URL` | **Vercel** (frontend) | Non | URL publique Render (ex. `https://<service>.onrender.com`) |
| `NEXT_PUBLIC_APP_URL` | Vercel | Non | URL publique Vercel (informatif) |
| `NEXT_PUBLIC_DEMO_MODE` | Vercel | Non | `true` (bandeau de démonstration ; actif par défaut) |

Variables **locales uniquement** (`.env.example` racine) : `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`, `THROTTLE_LIMIT`,
`LOGIN_THROTTLE_LIMIT`, `REGISTER_THROTTLE_LIMIT`. Non requises sur Render/Vercel
(les valeurs Render par défaut sont sans limitation agressive) ; ne pas copier les
identifiants de développement en production.

---

## 5. Limite du stockage des documents (importante)

Le stockage des documents est **local sur disque** (`DOCUMENT_STORAGE_DIR`),
**hors base**. Sur Render (plan gratuit comme payant sans disque persistant), le
système de fichiers est **éphémère** :

- Les métadonnées des documents vivent en base (Neon) et **persistent**.
- Le **contenu binaire** écrit localement est **perdu** à chaque redéploiement ou
  redémarrage de l'instance. Le contenu n'est **pas** répliqué entre instances.
- **Conséquence** : sur la démo hébergée, un document téléversé peut devenir
  introuvable après un redémarrage (`get` renverra une erreur de fichier absent).

**Ce que nous ne faisons pas** : nous ne prétendons **pas** que les documents
téléversés persistent sur Render. Pour une persistance durable il faut un
**adapter d'objet privé externe** (S3-compatible) — travail de code non réalisé à
ce stade (bloqueur DEP-5/READY-5). Pour la démonstration, le seed recrée des
documents synthétiques à chaque exécution contrôlée.

---

## 6. Étapes de déploiement

### Étape 1 — Base PostgreSQL (Neon)

1. Créer un projet sur https://neon.tech/. Utiliser une base **dédiée à la
   démonstration** (nommer p. ex. `sahatn-demo`).
2. Copier la *connection string* :
   `postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require`.
3. Conserver cette valeur pour Render (`DATABASE_URL`). Voir
   [`docs/neon.md`](neon.md) (allowlist IP, compte dédié, SSL obligatoire).

### Étape 2 — Backend (Render)

1. Render → **New → Blueprint**, sélectionner le dépôt GitHub. Render détecte
   `render.yaml` à la racine.
2. Renseigner les variables `sync: false` :
   - `DATABASE_URL` → chaîne Neon (avec `?sslmode=require`).
   - `CORS_ORIGIN` → URL Vercel (connue à l'étape 3 ; peut être renseignée après,
     avec un redéploiement).
3. Déployer. Le build exécute :
   `npm ci && npx prisma generate && npm run build && npx prisma migrate deploy`.
   (**Le seed n'est pas exécuté au build** — voir §2 et l'étape 4.)
4. Vérifier le health check : `https://<service>.onrender.com/api/health` → `200`.

### Étape 3 — Frontend (Vercel)

1. Vercel → **Add New → Project**, importer le dépôt GitHub.
2. **Root Directory** : `frontend` (obligatoire — le dépôt est un monorepo).
3. Framework : Next.js (auto-détecté). Build : `next build`.
4. Variables d'environnement (Production **et** Preview) :
   - `API_URL` = `https://<service>.onrender.com` (URL Render de l'étape 2).
   - `NEXT_PUBLIC_APP_URL` = URL publique Vercel.
   - `NEXT_PUBLIC_DEMO_MODE` = `true`.
5. Déployer. Noter l'URL publique Vercel.
6. Revenir dans Render, régler `CORS_ORIGIN` = URL Vercel, puis redéployer le
   backend.

> **Important** : `API_URL` est lue par `next.config.mjs` **au build**. Toute
> modification nécessite un **redéploiement** Vercel (pas seulement un restart).

### Étape 4 — Seed de démonstration (explicite, contrôlé)

À ne faire **qu'une fois** la base de démonstration cible confirmée :

1. Render → service backend → **Environment** : passer `SAHATN_DEMO_SEED` à `1`.
2. Render → **Shell** (ou job ponctuel) : `npx prisma db seed`.
3. Rétablir `SAHATN_DEMO_SEED` à `0`.

Le seed est idempotent : le rejouer ne crée pas de doublons. Ne **jamais** le
lancer contre une base non-démonstration (le garde-fou le refuse sans
`SAHATN_DEMO_SEED=1`).

---

## 7. Vérifications post-déploiement (à exécuter seulement avec URLs réelles)

- `GET https://<backend>/api/health` → `200`.
- Ouvrir l'URL Vercel : le **bandeau de démonstration** est visible.
- Se connecter avec un compte de démonstration ([DEMO_MODE.md](DEMO_MODE.md)) :
  mot de passe `DemoPassw0rd!2024`.
- Vérifier l'annuaire, la prise de rendez-vous et le dossier du patient de
  démonstration ; vérifier `/demo`.
- **Ne pas déclarer le déploiement terminé** avant que ces appels réussissent
  réellement ; consigner les URLs vérifiées.

---

## 8. Redéploiements et remise à zéro

- **Nouveau commit sur `main`** : Render et Vercel redéploient automatiquement
  (migrations appliquées au build ; **pas** de seed automatique).
- **Réinitialiser la démo** : étape 4 (§6).
- **Ne jamais saisir de données réelles** dans l'environnement de démonstration.

---

## 9. Compte administrateur

Aucun compte administrateur n'est publié ni créé par le seed. Pour l'exploitation
locale/interne uniquement :

```powershell
cd backend
$env:DATABASE_URL="postgresql://..."   # base de démonstration
$env:ADMIN_EMAIL="admin@example.tn"; $env:ADMIN_PASSWORD="<mot-de-passe-fort>"
npm run create-admin
```

Ne jamais publier ces identifiants et ne jamais les committer.

---

## 10. Alternative locale « production-like »

Pour valider sans cloud : `deploy.ps1` (Postgres embarqué 55435, `node dist/main`
+ `next start`). Outil **local** uniquement, pas un artefact cloud.
