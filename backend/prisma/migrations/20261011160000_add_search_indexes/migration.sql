-- Jour 5 : recherche nationale medecins + etablissements.
-- Les requetes de recherche utilisent des ILIKE `%q%` (Prisma `contains`
-- mode insensible a la casse) sur les colonnes de nom/villes, et des jointures
-- d'affiliations VERIFIEES. On ajoute uniquement les index correspondant aux
-- requetes prevues :
--   * trigramme (pg_trgm) sur lower(displayName) des medecins et des
--     etablissements : accelere `%q%` et `foo%`.
--   * trigramme sur lower(city) des etablissements (recherche par ville).
-- Note : ces index d'expression ne sont pas representables dans schema.prisma ;
-- ils vivent uniquement dans cette migration (rejouee par `migrate deploy`).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "DoctorProfile_displayName_trgm_idx"
  ON "DoctorProfile" USING gin (lower("displayName") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "HealthcareFacility_displayName_trgm_idx"
  ON "HealthcareFacility" USING gin (lower("displayName") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "HealthcareFacility_city_trgm_idx"
  ON "HealthcareFacility" USING gin (lower("city") gin_trgm_ops);