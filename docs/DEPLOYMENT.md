# Guide de déploiement — SahaTN (prototype de démonstration)

> **Prototype de démonstration à données synthétiques uniquement** (ADR-0007,
> ADR-0015, [DEMO_MODE.md](DEMO_MODE.md)). Aucune donnée médicale réelle.
> **Pas d'usage clinique réel**, pas de revendication de conformité.

Ce guide décrit le déploiement cible : **frontend Vercel + backend Render +
PostgreSQL managé (Neon)**. Certaines étapes exigent des **comptes externes** et
une intervention manuelle (création de projet, saisie de variables) : elles ne
peuvent pas être automatisées depuis le dépôt.

---

## 1. Architecture

```
Navigateur ──HTTPS──► Vercel (Next.js, racine frontend/)
                          │  rewrite same-origin /api/:path* → API_URL
                          ▼
                     Render (NestJS, racine backend/, /api)
                          │
                          ▼
                     PostgreSQL managé (Neon)  +  stockage documents (local)

Cookies de session : HttpOnly, SameSite=Lax, Secure (NODE_ENV=production),
host-only (COOKIE_DOMAIN vide) — posés sur l'origine du frontend via le proxy.
```

- **Frontend** : Vercel, *Root Directory* = `frontend/`. `API_URL` = URL publique
  du backend (baked au build par `next.config.mjs`).
- **Backend** : Render (Node), *Root Directory* = `backend/`, défini par
  `render.yaml`. Migrations **et** seed exécutés au build (idempotents).
- **Base** : Neon, `DATABASE_URL` **avec `?sslmode=require`**.

---

## 2. Prérequis

- Dépôt GitHub `koukijihed/sahaTN` (branche `main`).
- Comptes : GitHub, Vercel, Render, Neon.
- Aucun secret n'est committé : tout passe par les variables d'environnement.

---

## 3. Étape 1 — Base PostgreSQL (Neon)

1. Créer un projet sur https://neon.tech/.
2. Copier la *connection string* :
   `postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require`.
3. Conserver cette valeur pour Render (`DATABASE_URL`). Voir
   [`docs/neon.md`](neon.md) pour les règles de sécurité (allowlist IP, compte
   dédié, SSL obligatoire).

Aucune migration n'est à lancer à la main : le build Render s'en charge.

---

## 4. Étape 2 — Backend (Render)

1. Render → **New → Blueprint**, sélectionner le dépôt GitHub. Render détecte
   `render.yaml` à la racine.
2. Renseigner les variables marquées `sync: false` :
   - `DATABASE_URL` → la chaîne Neon (avec `?sslmode=require`).
   - `CORS_ORIGIN` → l'URL Vercel (connue à l'étape 3 ; peut être renseignée
     après et nécessite un redéploiement).
3. Déployer. Le build exécute :
   `npm ci && npx prisma generate && npm run build && npx prisma migrate deploy && npx prisma db seed`.
4. Vérifier que le health check répond :
   `https://<service>.onrender.com/api/health` → `200`.

> **Stockage des documents** : sur le plan gratuit Render, le système de
> fichiers est **éphémère**. Les documents synthétiques créés par le seed au
> build sont perdus à chaque redéploiement/redémarrage, et les documents
> téléversés au runtime ne persistent pas. Acceptable pour une **démonstration** ;
> un stockage objet privé (S3-compatible) est requis pour un usage durable
> (DEP-5).

---

## 5. Étape 3 — Frontend (Vercel)

1. Vercel → **Add New → Project**, importer le dépôt GitHub.
2. **Root Directory** : `frontend`.
3. Framework : Next.js (auto-détecté). Build : `next build`.
4. Variables d'environnement (Production **et** Preview) :
   - `API_URL` = `https://<service>.onrender.com` (URL Render de l'étape 2).
   - `NEXT_PUBLIC_DEMO_MODE` = `true` (le bandeau de démonstration reste actif
     par défaut même sans cette variable).
5. Déployer. Noter l'URL publique Vercel.
6. Revenir dans Render et régler `CORS_ORIGIN` = URL Vercel, puis redéployer le
   backend.

> **Important** : `API_URL` est lue par `next.config.mjs` **au build**. Toute
> modification nécessite un **redéploiement** Vercel (pas seulement un restart).

---

## 6. Étape 4 — Vérifications post-déploiement

- `GET https://<backend>/api/health` → `200`.
- Ouvrir l'URL Vercel : le **bandeau de démonstration** est visible.
- Se connecter avec un compte de démonstration (voir [DEMO_MODE.md](DEMO_MODE.md)) :
  mot de passe `DemoPassw0rd!2024`.
- Vérifier l'annuaire, la prise de rendez-vous et le dossier du patient de
  démonstration.
- Vérifier que `/demo` décrit les comptes et les limites.

---

## 7. Redéploiements et remise à zéro des données

- **Nouveau commit sur `main`** : Render et Vercel redéploient automatiquement.
- **Réinitialiser la démo** : relancer `npx prisma db seed` (idempotent) ou
  recréer le service.
- **Ne jamais saisir de données réelles** dans l'environnement de démonstration.

---

## 8. Compte administrateur

Aucun compte administrateur n'est publié ni créé par le seed. Pour l'exploitation
locale/interne uniquement :

```powershell
cd backend
$env:ADMIN_EMAIL="admin@example.tn"; $env:ADMIN_PASSWORD="<mot-de-passe-fort>"
npm run create-admin
```

Ne jamais publier ces identifiants et ne jamais les committer.

---

## 9. Alternative locale « production-like »

Pour valider sans cloud : `deploy.ps1` (Postgres embarqué 55435, `node dist/main`
+ `next start`). Outil **local** uniquement, pas un artefact cloud.
