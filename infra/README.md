# Infrastructure

Ce dossier regroupe les ressources d'infrastructure non applicatives de SahaTN.

Pour l'instant, l'environnement de développement est décrit dans le
[`docker-compose.yml`](../docker-compose.yml) à la racine.

## `infra/postgres/`

Emplacement prévu pour d'éventuels scripts d'initialisation PostgreSQL
(extensions, rôles, paramètres). Ces scripts seront montés dans le conteneur
PostgreSQL via `docker-entrypoint-initdb.d` lorsqu'un besoin réel apparaîtra.

Rien n'est défini à ce stade (Jour 1).
