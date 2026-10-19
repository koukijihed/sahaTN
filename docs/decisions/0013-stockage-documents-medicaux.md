# ADR-0013 — Stockage privé et accès contrôlé des documents médicaux

- **Statut** : Accepté
- **Date** : Jour 10

## Contexte

Après les dossiers et le contenu clinique structuré (Phase 4) et le moteur d'autorisation
(Phase 5), la Phase 6 ouvre les **pièces jointes médicales** : comptes rendus, résultats
d'analyses, imagerie, ordonnances. Contrairement au contenu clinique, ces éléments sont des
**fichiers binaires** (PDF, images). Les stocker poses des problèmes spécifiques :

- le contenu binaire a une surface d'attaque propre (fichiers malveillants, fuite, énorme
  volume) ;
- une URL publique ou un stockage serviable par un serveur web exposerait directement des
  données de santé ;
- l'accès ne doit pas être réinventé : il doit **réutiliser** le moteur d'autorisation de
  l'[ADR-0012](0012-acces-consentement-urgence.md) ;
- il faut pouvoir changer de backend de stockage (local en développement, objet privé en
  production) sans toucher au domaine.

Le [principe fondateur](../security.md) — *une authentification réussie ne suffit jamais* —
s'applique intégralement : ni le rôle, ni l'affiliation, ni un rendez-vous ne donnent accès
aux documents d'un patient.

## Décision

### 1. Métadonnées en base, contenu hors base

La table `MedicalDocument` ne contient que des **métadonnées** : catégorie, nom original,
clé de stockage, types MIME déclaré et détecté, taille, empreinte SHA-256, statut, auteur,
et un rattachement **optionnel** à une consultation. Le **contenu binaire ne vit jamais dans
la base**.

### 2. Stockage privé abstrait et clé générée par le serveur

`MedicalDocumentStorage` (jeton `MEDICAL_DOCUMENT_STORAGE`) définit `save` / `read` /
`remove`. L'implémentation de développement, `LocalPrivateDocumentStorage`, écrit dans une
racine **privée** configurable (`DOCUMENT_STORAGE_DIR`) avec des permissions restreintes
(`0o600`) et un `flag 'wx'` (jamais d'écrasement).

- La **clé de stockage est générée par le serveur** (`documents/AAAA/MM/<uuid>`), jamais
  dérivée du nom de fichier fourni par l'utilisateur.
- Toute clé **hors racine** (chemin absolu, `..`, octet nul, clé vide) est **rejetée** —
  protection contre la traversée de répertoire.
- La clé n'est **jamais exposée** par l'API ; seul le contenu est servi après autorisation.
- L'interface permet de brancher plus tard un stockage objet privé (S3-compatible) sans
  modifier le domaine.

### 3. Validation stricte du contenu

Le type n'est jamais déduit du seul `Content-Type` ni de l'extension : les **octets
d'en-tête** (*magic bytes*) sont inspectés. Sont acceptés, et seulement eux :
`application/pdf`, `image/png`, `image/jpeg`, `image/webp`. Toute incohérence entre
extension, type déclaré et contenu est **refusée**. La taille est bornée par configuration
(`DOCUMENT_MAX_FILE_BYTES`, 5 Mo par défaut) et par un plafond dur multer. Un dépôt vide,
trop volumineux, non supporté ou incohérent renvoie une erreur HTTP explicite (`400` / `413`
/ `415`) et est **audité** (`DOCUMENT_REJECTED` avec un code de raison borné).

### 4. Intégrité vérifiée

Une empreinte **SHA-256** est calculée au dépôt (stockée en base) et **re-vérifiée à chaque
téléchargement**. Un contenu altéré sur le support de stockage entraîne un refus (`500`) et
un audit (`DOCUMENT_REJECTED`, raison `integrity_failure`).

### 5. Autorisation déléguée au moteur existant

Aucune logique d'accès dupliquée. Les documents réutilisent `RecordAccessService` :

- **lecture/téléchargement** : `VIEW_DOCUMENTS`, avec repli **lecture seule** en accès
  d'urgence (comme le reste du dossier) ;
- **dépôt/archivage** : `WRITE_DOCUMENTS`, **jamais** de repli d'urgence ;
- le **patient** accède toujours à ses propres documents (self-access).

L'accès est strictement **par dossier** : un identifiant de document appartenant à un autre
patient est indistinguable d'un identifiant inexistant (`404`).

### 6. Archivage logique, jamais de suppression silencieuse

Le retrait d'un document est **logique** (`status` : `ACTIVE` → `ARCHIVED`, avec date,
auteur et motif facultatifs). Un document archivé n'est plus téléchargeable. Un déclencheur
`BEFORE DELETE` (`MedicalDocument_no_silent_delete`) empêche la suppression silencieuse en
base ; `remove` n'est utilisé que pour annuler un dépôt qui n'a **pas** abouti en base.

### 7. Audit systématique

Chaque action alimente le journal append-only : `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`,
`DOCUMENT_DOWNLOADED`, `DOCUMENT_ARCHIVED`, `DOCUMENT_REJECTED` (le journal est protégé en
écriture et contre la suppression, cf. ADR-0012).

## Conséquences

**Avantages**
- Aucune URL publique : le contenu n'est servi qu'après autorisation du même moteur que le
  reste du dossier — le principe « pas d'accès sans base explicite » est **préservé**.
- Types bornés, validation par contenu, taille limitée et intégrité vérifiée réduisent la
  surface d'attaque des fichiers.
- Clé serveur + protection de traversée : un nom de fichier hostile ne peut pas cibler le
  système de fichiers.
- Le domaine ne dépend pas du backend de stockage (interface) ; un passage au stockage
  objet privé est localisé.
- Archivage logique + suppression scellée en base : l'historique ne peut pas être effacé
  silencieusement.

**Limites**
- Pas encore d'**antivirus** ni de **chiffrement au repos** du contenu (le stockage local ne
  les intègre pas). Ces points restent **ouverts** et sont explicitement suivis.
- Pas de **versionnage** des documents ni de politique de rétention formelle ; pas de
  réplication de type stockage objet (disponibilité/sauvegarde).
- La détection de type couvre les formats courants ; elle ne prétend pas à une analyse
  approfondie d'un fichier (parseurs complets, images lourdes).

**Suites**
- Branchement d'un **stockage objet privé** (S3-compatible) via l'interface.
- **Antivirus** et **chiffrement au repos** ; politique de conservation.
- Résultats d'examens **structurés** (biologie, imagerie) au-dessus des pièces jointes
  génériques.

## Références

- Modèle et migration : `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/20261011240000_add_medical_documents/`
- Stockage : `backend/src/modules/medical-records/documents/medical-document-storage.ts`,
  `.../documents/local-document-storage.ts`
- Validation : `backend/src/modules/medical-records/documents/document-validation.ts`
- Service et contrôleurs : `.../documents/medical-documents.service.ts`,
  `.../documents/medical-documents.controller.ts`
- Tests : `.../documents/document-validation.spec.ts`,
  `.../documents/local-document-storage.spec.ts`,
  `backend/test/medical-documents.e2e-spec.ts`
- Principe et moteur d'autorisation : [ADR-0004](0004-autorisation-contextuelle.md),
  [ADR-0012](0012-acces-consentement-urgence.md)
