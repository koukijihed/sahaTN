# FHIR R4 schema — provenance

Ce dossier contient le **schéma JSON officiel** de HL7 FHIR, utilisé pour une
**validation structurelle indépendante** des Bundles produits par SahaTN.

| Champ            | Valeur                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Standard         | HL7 FHIR R4                                                            |
| Version FHIR     | **4.0.1** (juin 2020)                                                  |
| Fichier          | `fhir.schema.json`                                                     |
| Source officielle| https://hl7.org/fhir/R4/fhir.schema.json                               |
| SHA-256          | `2230406893b4cf002a4ee1e5e2bbeca22ac5d2d4931b3e9ef7b9594bbc376a01`     |
| Taille           | 3 386 892 octets                                                       |

## Régénération

```sh
node scripts/fetch-fhir-schema.mjs
```

Le script télécharge le schéma depuis la source officielle ci-dessus et **vérifie
l'empreinte SHA-256** avant écriture : il refuse tout contenu inattendu.

## Nature de la validation

Le schéma officiel vérifie la **forme** (types, cardinalités déclarées). Il **ne
garantit pas** la conformité à un **profil d'interopérabilité** particulier (ex.
profils nationaux, extensions, terminologies imposées) : cette distinction est
essentielle (voir `docs/architecture.md` et l'ADR-0014).

Le moteur de validation (`ajv` 8.x, en `devDependencies`) doit surcharger
`$schema` en `draft-07` : le fichier publié déclare `draft-06`, non supporté
nativement par `ajv` 8. Cette surcharge est sans effet sur les règles évaluées.
La validation des `format` est volontairement désactivée (les `format` FHIR ne
correspondent pas exactement aux `format` JSON Schema).
