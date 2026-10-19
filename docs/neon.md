# Connexion Neon (PostgreSQL managé) pour SahaTN

Neon est une base PostgreSQL managée (branching, SSL). Pour un déploiement sur Render/Vercel :

1. Créer un projet Neon : https://neon.tech/
2. Récupérer la **connection string** (sans pooling ou pooled selon besoin) :
   `postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require`
3. Ne jamais commiter cette chaîne. La mettre dans les variables d'environnement :
   - Render : Dashboard → Service → Environment → `DATABASE_URL` (avec `?sslmode=require`)
   - Vercel : Project → Settings → Environment Variables → `DATABASE_URL`
4. Appliquer les migrations en premier déploiement :
   - Depuis le backend : `npx prisma migrate deploy` (après avoir positionné `DATABASE_URL`)
   - Ou utiliser le script `backend/scripts/dev-db.mjs` non conseillé en prod
5. Règles de sécurité :
   - Autoriser uniquement l'IP du backend Render (ou `0.0.0.0/0` non recommandé ; Neon propose IP allowlist)
   - Utiliser un compte dédié (pas `postgres` superuser si possible)
   - Jamais de données réelles (uniquement données fictives)
   - `sslmode=require` obligatoire côté serveur
6. Remarques SahaTN :
   - Schéma déjà prêt (`prisma/schema.prisma`, 9 migrations)
   - Seed non automatique en `migrate deploy` (seulement via `prisma db seed`)
   - Pour un premier bootstrap : `npx prisma migrate deploy && npx prisma db seed` (sur environnement demo fictif uniquement)
   - `embedded-postgres` n'est utilisé qu'en local/CI de tests
7. Test rapide :
   `psql "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require" -c "\dt"`
