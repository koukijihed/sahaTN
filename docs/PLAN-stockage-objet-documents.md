# Plan — Stockage objet privé des documents médicaux (S3-compatible)

> **Statut** : **plan** (non implémenté). Aucune ressource payante n'est créée
> sans approbation. Ce document décrit une cible, pas un état atteint.
> Prototype de démonstration à **données synthétiques uniquement**.

## 1. Contexte et problème

L'implémentation actuelle (`LocalPrivateDocumentStorage`,
`backend/src/modules/medical-records/documents/local-document-storage.ts`)
écrit le **contenu binaire** des documents sur le **système de fichiers local**
(racine `DOCUMENT_STORAGE_DIR`, par défaut `backend/storage/private-documents`).

Sur Render, ce système de fichiers est **éphémère** :

- Le contenu est perdu à chaque redéploiement/redémarrage.
- Il n'est pas partagé entre instances multiples.
- Les **métadonnées** restent en base (Neon) et persistent ; seul le **contenu**
  disparaît → incohérence métadonnées/contenu après un restart.

**Conséquence assumée** : sur la démo hébergée, un document téléversé peut
devenir introuvable. Nous ne prétendons **pas** que les documents téléversés
persistent (voir [DEPLOYMENT.md](DEPLOYMENT.md) §5).

## 2. Point d'extension existant

Le domaine dépend déjà d'une **interface**, pas d'une implémentation concrète :

```ts
// backend/src/modules/medical-records/documents/medical-document-storage.ts
export interface MedicalDocumentStorage {
  save(key: string, content: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export const MEDICAL_DOCUMENT_STORAGE = 'MEDICAL_DOCUMENT_STORAGE';
```

Un adapter S3-compatible s'ajoute **sans modifier** le domaine ni les
contrôleurs/services : il suffit de fournir le provider `MEDICAL_DOCUMENT_STORAGE`
via la configuration du module selon l'environnement.

## 3. Cible proposée

- **Bucket privé** (aucun accès public, aucune URL publique), serveur choisi à
  l'approbation de l'opérateur : AWS S3, Cloudflare R2, Backblaze B2, MinIO
  auto-hébergé, ou Scaleway Object Storage. **Aucun coût engagé sans
  autorisation.**
- **Contrat d'interface inchangé** : `save`/`read`/`remove` sur la clé serveur.
- **Clé** : conservée identique (`documents/...`), jamais exposée au client.
- **Accès** : le serveur uniquement, via identifiants scopés au bucket
  (IAM/clé d'API). Les lectures passent par l'API backend après contrôle
  d'autorisation contextuelle — **pas** de presigned URL publique exposant le
  document.
- **Chiffrement au repos** : SS4/KMS côté fournisseur (SSE) ; chiffrement
  applicatif côté serveur en option (le domaine ne le suppose pas aujourd'hui).
- **Intégrité** : vérification SHA-256 déjà calculée par le backend
  (`checksumSha256` dans les métadonnées) à l'écriture **et** à la lecture.
- **Antivirus** : scan de contenu requis avant exposition (aujourd'hui absent) —
  reste un bloqueur P0/P1 indépendant du stockage.

## 4. Variables d'environnement envisagées (noms, pas de valeurs)

| Variable | Secret | Objet |
| --- | --- | --- |
| `DOCUMENT_STORAGE_DRIVER` | Non | `local` (défaut) \| `s3` |
| `DOCUMENT_S3_BUCKET` | Non | Nom du bucket privé |
| `DOCUMENT_S3_REGION` | Non | Région du fournisseur |
| `DOCUMENT_S3_ENDPOINT` | Non | Endpoint (requis pour R2/B2/MinIO) |
| `DOCUMENT_S3_ACCESS_KEY_ID` | **Oui** | Identifiant scopé au bucket |
| `DOCUMENT_S3_SECRET_ACCESS_KEY` | **Oui** | Clé secrète scopée au bucket |
| `DOCUMENT_S3_FORCE_PATH_STYLE` | Non | `true` pour MinIO/B2 |

Les secrets sont fournis uniquement via l'interface d'environnement du
fournisseur d'hébergement ; jamais committés ni journalisés.

## 5. Étapes d'implémentation (non réalisées)

1. Dépendance client S3-compatible (`@aws-sdk/client-s3`), ajoutée au backend.
2. `S3PrivateDocumentStorage implements MedicalDocumentStorage` dans le même
   dossier, avec les mêmes protections de clé (rejet absolu/traversée).
3. Sélection du provider dans le module documents selon
   `DOCUMENT_STORAGE_DRIVER` (défaut `local`, comportement inchangé).
4. Tests : adapter local (déjà testé) + tests de l'adapter S3 contre un **MinIO
   éphémère** en CI (pas de coût, pas de données réelles).
5. Migration de données : aucune (démo) ; pour un usage réel, script de recopie
   vérifié par `checksumSha256`.
6. Durcissement : chiffrement SSE activé, bucket privé, politique IAM minimale,
   journalisation d'accès au bucket.

## 6. Décision requise de l'opérateur

- Choix du fournisseur (coût/quotas) → **approbation explicite requise**.
- Décision sur le chiffrement applicatif côté serveur (défense en profondeur).
- Traitement du scan antivirus (reste ouvert indépendamment).
