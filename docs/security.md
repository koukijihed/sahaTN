# Sécurité — SahaTN

> Les données de santé sont **hautement sensibles**. Ce document définit les exigences de
> sécurité et un modèle de menace initial. Il évoluera avec le projet.

## 1. Principes fondateurs

1. **Sécurité dès la conception** (*security by design*) et par défaut.
2. **Moindre privilège** : chaque acteur n'a que les droits strictement nécessaires.
3. **Défense en profondeur** : plusieurs couches indépendantes.
4. **Contrôle serveur** : toute décision d'accès est prise côté serveur.
5. **Traçabilité** : tout accès à une donnée médicale est journalisé.
6. **Minimalité** : ne pas collecter ni conserver plus que nécessaire.

> **Règle d'or** : une authentification réussie ne suffit **jamais** à autoriser l'accès à
> un dossier médical. L'autorisation dépend aussi du contexte (relation de soin,
> consentement, urgence encadrée).

## 2. Authentification et sessions

**Implémenté au Jour 2 :**

- Mots de passe hachés avec **Argon2id** (`@node-rs/argon2`), jamais en clair, jamais
  réversibles. Longueur minimale de 12 caractères, avec au moins une lettre et un chiffre.
- **Sessions opaques en base** : le jeton (32 octets aléatoires) n'est stocké que sous
  forme de **hachage SHA-256** (`Session.tokenHash`) ; le jeton en clair n'existe que dans
  le cookie. Révocation immédiate par `revokedAt`. Voir
  [ADR-0008](decisions/0008-sessions-et-csrf.md).
- **Cookies** : `HttpOnly`, `SameSite=Lax`, `Secure` hors développement.
- **Protection CSRF** par double soumission (cookie `sahatn_csrf` + en-tête
  `x-csrf-token`) et **vérification de l'origine** sur les requêtes à état.
- **Anti-force brute** : verrouillage temporaire du compte après plusieurs échecs, et
  limitation de débit par IP. Voir [ADR-0009](decisions/0009-anti-force-brute.md).
- Déconnexion explicite ; invalidation de la session côté serveur.
- Aucun jeton ni hachage exposé dans les réponses, les logs ou les URL.

**Cible (non encore implémentée) :**

- **MFA/2FA** pour les comptes professionnels et administratifs (prioritaire en Phase 1).
- Rotation du jeton de session à la connexion sensible.

## 3. Autorisation : rôles et contexte

### 3.1 Séparation des rôles (RBAC)

| Rôle                   | Portée                                                        |
| ---------------------- | ------------------------------------------------------------- |
| Patient                | Son propre profil et ses données.                             |
| Médecin                | Ses patients dans le cadre d'une relation de soin autorisée.  |
| Personnel administratif| Gestion des rendez-vous, sans accès clinique par défaut.      |
| Établissement          | Ses lieux, services, praticiens, agendas.                     |
| Administrateur         | Administration technique et qualité des données.              |
| Auditeur               | Lecture des journaux d'audit (sans modification).             |

### 3.2 Autorisation contextuelle (au-delà du RBAC)

L'accès à un dossier médical exige une **base d'accès explicite** :

- **consentement du patient** : autorisation expresse (`MedicalRecordGrant`), granulaire
  (lecture/écriture par catégorie) et révocable ;
- ou **accès d'urgence** encadré (*break-glass*), en **lecture seule** (voir §9).

> Le rôle `DOCTOR`, une affiliation à un établissement ou un rendez-vous passé ne
> constituent **jamais** une base d'accès suffisante. La relation de soin
> (`CareRelationship`) n'est qu'une **projection informative** : elle ne donne aucun accès.

Les **documents médicaux** (Jour 10) réutilisent ce même moteur : `VIEW_DOCUMENTS` pour la
lecture et le téléchargement (avec repli **lecture seule** en urgence), `WRITE_DOCUMENTS`
pour le dépôt et l'archivage (jamais de repli d'urgence). Voir
[ADR-0013](decisions/0013-stockage-documents-medicaux.md).

Ces règles sont appliquées **côté serveur** par un **moteur d'autorisation unique**
(`RecordAccessService`) et testées (positif **et** négatif). Voir
[ADR-0004](decisions/0004-autorisation-contextuelle.md) et
[ADR-0012](decisions/0012-acces-consentement-urgence.md).

## 4. Protections applicatives

- **Injections** (SQL/NoSQL/commande) : requêtes paramétrées via l'ORM (Prisma),
  aucune concaténation de requêtes.
- **XSS** : échappement par défaut du framework, en-têtes de sécurité, CSP.
- **CSRF** : protection pour les actions sensibles à état (jeton CSRF / cookies
  `SameSite` + vérification d'origine).
- **Accès directs non autorisés** (*IDOR*) : vérification serveur de la propriété et des
  droits sur **chaque** objet demandé, jamais seulement par identifiant devinable.
- **Abus d'API** : limitation de débit (*rate limiting*), quotas, pagination bornée.
- **En-têtes de sécurité** : `Helmet` (HSTS, `X-Content-Type-Options`, etc.).
- **CORS** : liste blanche d'origines explicite.
- **Taille des requêtes** : bornée (anti-DoS applicatif).
- **Chaîne d'approvisionnement** : les scripts d'installation des dépendances sont
  approuvés explicitement et **épinglés par version** (champ `allowScripts` des
  `package.json`), plutôt qu'exécutés implicitement.

## 5. Validation des entrées

- Validation stricte de **toutes** les entrées côté serveur (DTO + schémas), avec rejet
  des champs non attendus (*whitelist*).
- La validation côté client est un confort, **jamais** une garantie de sécurité.
- Le typage TypeScript ne remplace pas la validation à l'exécution.

## 6. Chiffrement et secrets

- **En transit** : HTTPS/TLS partout (HSTS).
- **Au repos** : chiffrement du stockage, notamment pour les données médicales et les
  sauvegardes. *(Le contenu des documents médicaux est stocké hors base dans un espace
  privé, mais le chiffrement au repos de ce contenu reste à mettre en œuvre — voir
  [ADR-0013](decisions/0013-stockage-documents-medicaux.md).)*
- **Secrets** : gérés hors du dépôt (`.env` non versionné, gestionnaire de secrets en
  production). Aucune clé, aucun mot de passe dans Git.
- Rotation des secrets et des clés.

## 7. Journalisation et audit

- Journaliser **les accès aux données médicales** : qui, quoi, quand, depuis où,
  pourquoi (base d'accès), et le résultat (succès/échec).
- **Ne jamais écrire de données médicales sensibles** dans les logs (ni valeurs
  cliniques, ni contenu de dossier).
- Journal d'audit **append-only**, protégé en écriture, conservé selon la politique de
  rétention.
- Détection d'activités suspectes (accès massifs, hors horaires, échecs répétés).

## 8. Gestion des erreurs

- Messages d'erreur génériques côté client.
- Aucune fuite d'information technique (stack traces, requêtes, chemins, versions).
- Corrélation par identifiant de requête pour l'investigation interne.

## 9. Accès d'urgence (*break-glass*)

**Implémenté au Jour 9 :**

- Possible uniquement sous **règles strictes** : **justification obligatoire**, **lecture
  seule**, **durée limitée** (fenêtre de 24 h), praticien **vérifié** uniquement.
- **Traçabilité renforcée** : activation (`EMERGENCY_ACCESS_GRANTED`) et expiration
  (`EMERGENCY_ACCESS_EXPIRED`) journalisées ; le patient est **notifié** de l'activation.
- Aucun **repli d'urgence** pour l'écriture : modifier un dossier exige une autorisation
  explicite du patient.

**Cible (non encore implémentée) :**

- Revue a posteriori **outillée** et **alerte** aux administrateurs (Phase 7).
- Cadre précisé avec les autorités de santé (voir [`roadmap.md`](roadmap.md)).

## 10. Données : conservation, suppression, consentement

- **Politique de conservation** à définir (durées par catégorie de données).
- **Suppression / anonymisation** : procédure encadrée, sans casser l'intégrité de
  l'historique ni les obligations légales.
- **Consentement et bases légales** : à définir selon le cadre juridique tunisien
  (soin, consentement, intérêt public, urgence). **Aucune conformité n'est considérée
  comme acquise sans validation juridique.**

## 11. Sauvegardes et continuité

- Sauvegardes **chiffrées** et à accès restreint.
- Sauvegardes testées par une **procédure de restauration** documentée et exercée.
- Séparation des privilèges entre exploitation et administration des données.

## 12. Modèle de menace initial (STRIDE)

**Actifs à protéger** : dossiers médicaux, identités des patients, comptes
professionnels, journaux d'audit, secrets et clés, disponibilité du service.

**Acteurs malveillants** : attaquant externe, utilisateur authentifié abusif (interne
curieux), compte compromis, logiciel malveillant, erreur humaine.

| Catégorie STRIDE             | Exemple de menace                                    | Contre-mesures principales                                   |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **S**poofing (usurpation)    | Vol de session / identifiants                        | MFA, cookies sécurisés, rotation de jetons, anti-force brute |
| **T**ampering (altération)   | Modification illégitime d'un dossier ou d'un log     | Autorisation serveur, journal append-only, intégrité         |
| **R**epudiation (répudiation)| Nier un accès à un dossier                           | Audit complet et horodaté, corrélation                       |
| **I**nformation disclosure   | Fuite de dossiers, IDOR, fuite via logs/erreurs      | Moindre privilège, contrôle par objet, pas de données en logs|
| **D**enial of service        | Saturation de l'API                                  | Rate limiting, quotas, pagination bornée, protection amont   |
| **E**levation of privilege   | Passage patient → médecin, ou accès admin            | RBAC + contexte, vérification serveur, tests d'autorisation  |

## 13. Exigences vérifiables

- [x] Hachage des mots de passe vérifié par test (Argon2id, deux hachages distincts du
  même mot de passe ; aucune fuite de `passwordHash` dans les réponses d'inscription et de
  connexion).
- [x] Contrôle d'accès testé pour l'identité (positif **et** négatif : `/auth/me` en `401`
  sans session, `200` avec session ; rôles via tests unitaires du `RolesGuard`).
- [x] Contrôle d'accès testé pour les ressources métier (professionnels et vérification :
  accès propriétaire, actions admin-only, refus d'auto-décision, confidentialité du
  répertoire public — voir `backend/test/doctors.e2e-spec.ts`).
- [x] Audit des rendez-vous généré par transition et **non modifiable** testé (les
  événements ne peuvent être ni modifiés ni supprimés : déclencheurs `BEFORE UPDATE OR
  DELETE`, `backend/test/appointments.e2e-spec.ts`).
- [x] Accès aux dossiers médicaux strictement conditionné par une **base explicite** et
  testé (positif **et** négatif : rôle, affiliation et rendez-vous passé insuffisants ;
  autorisation granulaire, révocation immédiate, expiration, refus hors contexte —
  `backend/test/medical-records.e2e-spec.ts`).
- [x] Accès d'urgence **lecture seule**, borné, justifié et audité testé (activation,
  notification, expiration ; écriture sans repli d'urgence).
- [x] Journal d'accès et d'autorisation **append-only** non modifiable testé (déclencheurs
  `BEFORE UPDATE OR DELETE`, `backend/test/medical-records.e2e-spec.ts`).
- [x] Documents médicaux : **validation du contenu** (type déduit des octets, extensions/
  types incohérents refusés, taille bornée, dépôt vide/refusé **audité**) et **intégrité
  SHA-256** re-vérifiée au téléchargement (contenu altéré refusé) testées
  (`backend/test/medical-documents.e2e-spec.ts`).
- [x] Documents médicaux : **autorisation déléguée** au moteur d'accès testée (lecture
  `VIEW_DOCUMENTS`, écriture `WRITE_DOCUMENTS` sans repli d'urgence, urgence en lecture
  seule, croisement de dossiers refusé) et **clé de stockage jamais exposée** par l'API.
- [ ] Journal d'audit agrégé et détection d'anomalies testés (Phase 7).
- [x] Validation stricte testée (rejet des entrées invalides et des champs non attendus ;
  rôle privilégié auto-attribué rejeté).
- [x] Anti-force brute / limitation testée (verrouillage de compte après échecs répétés).
- [ ] En-têtes de sécurité vérifiés par test (Helmet est activé, sans test dédié).
- [ ] Absence de données sensibles dans les logs vérifiée (à faire).
- [ ] Restauration de sauvegarde exercée (à faire).

> Tant que ces points ne sont pas couverts par des tests, aucune fonctionnalité ne doit
> être présentée comme « sécurisée ». Les cases cochées renvoient à des tests exécutés
> (voir `backend/test/auth.e2e-spec.ts` et les `*.spec.ts`).

## 13bis. Journal des protections actives (Jour 2)

- Hachage Argon2id (jamais de mot de passe en clair).
- Sessions opaques révocables, non lisibles par JavaScript.
- CSRF (double soumission) + vérification d'origine sur requêtes à état.
- Rôles stricts à l'inscription (aucun rôle privilégié en auto-attribution).
- Messages d'erreur génériques (pas de distinction « email inconnu » / « mauvais mot de
  passe » à la connexion).
- Réponses d'identité filtrées : `email`, `phone`, `status`, `roles` — jamais le hachage.

## 13ter. Journal des protections actives (Jour 3)

- Profil professionnel modifiable uniquement par son propriétaire ; champs strictement
  autorisés (aucun `userId`, statut de vérification ou rôle dans les DTO).
- Demandes de vérification : le professionnel soumet la sienne ; **aucune auto-décision**
  (même avec le rôle admin) ; décisions réservées aux administrateurs.
- Transitions d'état de vérification bornées (machine à états) ; journal d'audit
  append-only (`DoctorVerificationEvent`) à chaque étape ; motif requis pour les refus.
- Rôle `DOCTOR` attribué **uniquement** après approbation administrative.
- Répertoire public : seuls les profils **vérifiés et publiés** sont exposés ; les autres
  renvoient `404` sans révéler l'existence d'un profil.
- Mêmes erreurs génériques pour un accès refusé (pas de détail sur les demandes admin
  dans les réponses d'un patient).

## 13quater. Journal des protections actives (Jours 6-7)

- **Réservation idempotente** : un `idempotencyKey` rejoué ne crée pas de doublon ; un
  créneau déjà réservé est refusé (pas de double réservation en concurrence).
- **Autorisation par objet** sur chaque agenda, créneau et rendez-vous : accès réservé au
  patient concerné, au praticien/gestionnaire de l'affiliation, ou à l'administrateur.
- **Machine à états des rendez-vous** : transitions bornées (`CONFIRM`, `REJECT`,
  `COMPLETE`, `NO_SHOW`) ; motif requis pour un refus ; réservation refusée (`409`) quand
  l'agenda est en mode `DISABLED`.
- **Audit append-only scellé en base** : fonction `sahatn_audit_append_only` + déclencheurs
  `BEFORE UPDATE OR DELETE` sur `AppointmentEvent`, `AppointmentScheduleEvent`,
  `DoctorVerificationEvent`, `FacilityVerificationEvent` — l'immutabilité ne dépend plus du
  seul code applicatif.
- **Notifications minimisées** : les charges utiles n'incluent pas le motif libre du
  patient ; l'adaptateur Noop marque les envois `SKIPPED` et **ne prétend jamais** les
  avoir envoyés ; l'échec d'une notification ne fait jamais échouer la transaction métier.
- **Déduplication** des notifications par `dedupeKey` (unicité en base).

## 13quinquies. Journal des protections actives (Jours 8-9)

- **Pas d'accès par le rôle** : être `DOCTOR`, affilié à un établissement ou avoir vu le
  patient en consultation ne donne **aucun** accès au dossier. Seules une **autorisation
  explicite** du patient ou une **urgence encadrée** le permettent.
- **Moteur d'autorisation unique** (`RecordAccessService`) : règles centralisées et testées
  isolément ; les couches métier n'autorisent pas elles-mêmes.
- **Consentement granulaire et révocable** : permissions de lecture/écriture distinctes,
  fenêtre de validité, cycle de vie `ACTIVE`/`REVOKED` journalisé ; pas de création d'une
  autorisation déjà expirée.
- **Refus par défaut, audité et générique** : toute tentative d'accès hors contexte est
  journalisée (`ACCESS_DENIED`) avec un **code de raison borné**, et renvoie un message
  **générique** (sans révéler l'existence d'un dossier).
- **Relation de soin informative** : `CareRelationship` sert à informer (patients
  accessibles, journal), **jamais** de clé d'accès ; y mettre fin n'annule pas une
  autorisation explicite.
- **Accès d'urgence *break-glass*** : lecture seule, **24 h**, justification obligatoire,
  praticien vérifié, activation/expiration auditées et **patient notifié** ; aucun repli
  d'urgence pour l'écriture.
- **Immuabilité clinique scellée en base** : fonction `sahatn_clinical_no_delete` +
  déclencheurs `BEFORE DELETE` sur dossiers, consultations, relations et autorisations ;
  journal d'accès append-only (`BEFORE UPDATE OR DELETE`).

## 13sexies. Journal des protections actives (Jour 10)

- **Contenu hors base** : les documents médicaux stockent leurs **métadonnées** en base et
  leur **contenu binaire** dans un **stockage privé** (aucune URL publique) ; la clé de
  stockage est **générée par le serveur** (`documents/AAAA/MM/<uuid>`) et **jamais exposée**
  par l'API.
- **Protection du système de fichiers** : toute clé **hors racine** (chemin absolu, `..`,
  octet nul, clé vide) est rejetée ; écriture avec permissions restreintes (`0o600`) et sans
  écrasement (`flag 'wx'`).
- **Validation par contenu** : type MIME déduit des **octets** (*magic bytes*), limité à
  PDF/PNG/JPEG/WEBP ; toute incohérence extension / type déclaré / contenu est refusée ;
  taille bornée (`DOCUMENT_MAX_FILE_BYTES`, 5 Mo par défaut) et plafond dur multer.
- **Refus audités** : un dépôt vide, trop volumineux, non supporté ou incohérent est refusé
  (`400`/`413`/`415`) et journalisé (`DOCUMENT_REJECTED` avec un **code de raison borné**).
- **Intégrité vérifiée** : empreinte **SHA-256** calculée au dépôt et **re-vérifiée** à
  chaque téléchargement ; un contenu altéré sur le support entraîne un refus et un audit.
- **Autorisation déléguée** : lecture/téléchargement sous `VIEW_DOCUMENTS` (repli **lecture
  seule** en urgence), dépôt/archivage sous `WRITE_DOCUMENTS` (**jamais** l'urgence) ; le
  patient accède toujours à ses propres documents ; accès strictement **par dossier**.
- **Archivage logique et suppression scellée** : le retrait est logique
  (`ACTIVE` → `ARCHIVED`) ; déclencheur `BEFORE DELETE` (`MedicalDocument_no_silent_delete`)
  contre la suppression silencieuse.
- **Limites assumées** : **pas encore** d'antivirus ni de chiffrement au repos du contenu ;
  stockage objet privé (S3-compatible), versionnage et rétention **à venir**. Voir
  [ADR-0013](decisions/0013-stockage-documents-medicaux.md).

## 13septies. Journal des protections actives (Jour 11)

- **Export FHIR en lecture seule** : le module `fhir` ne fait que **projeter** des données
  existantes ; aucune écriture, aucun import, aucun serveur FHIR exposé, **aucune
  connexion réseau externe**.
- **Autorisation réutilisée (Jour 9)** : les exports patient/praticien passent par le même
  moteur contextuel et sont **granulaires par section** (`VIEW_RECORD`, `VIEW_ENCOUNTERS`,
  `VIEW_OBSERVATIONS`, `VIEW_DIAGNOSES`, `VIEW_ALLERGIES`, `VIEW_DOCUMENTS`) ; l'accès
  d'urgence reste en **lecture seule** ; un praticien non autorisé reçoit un **refus
  générique** sans donnée clinique.
- **Export audité** : chaque export accepté est journalisé (`RECORD_VIEWED`, cible
  `FhirExport`) ; un export **refusé** est également audité (`ACCESS_DENIED`, via le moteur
  d'autorisation), avec un **refus générique** sans donnée clinique.
- **Pas de fuite de données sensibles** : le bundle **n'expose jamais** la **clé de
  stockage** des documents (`storageKey`), les secrets d'authentification, les jetons de
  session/CSRF, ni le **journal d'accès** (`AuditEvent` exclu des bundles cliniques).
- **Validation structurelle** (`validateFhirBundle`) : forme, champs requis, format d'`id`,
  intégrité des références, et rejet explicite de clés/valeurs interdites
  (`storageKey`, `private-documents`, URL/`data:` d'images) et de toute pièce jointe inline.
- **Validation indépendante** (`validateFhirBundleAgainstSchema`) : contrôle de forme contre
  le **schéma JSON officiel HL7 FHIR R4 (4.0.1)**, archivé et vérifié par empreinte SHA-256
  (`backend/test/fixtures/fhir-r4/`). Elle **complète** le validateur de règles SahaTN sans
  vérifier un profil d'interopérabilité (extensions/terminologies nationales).
- **Identifiants et terminologies bornés** : identifiants internes uniquement
  (`urn:sahatn:identifier:*`) ; email/téléphone en `telecom` ; **jamais** revendiqués comme
  identifiant sanitaire national ; aucune terminologie nationale inventée.
- **Limites assumées** : **aucun** connecteur institutionnel réel (profils/terminologies
  nationaux, correspondance d'identité, sécurité inter-systèmes, cadre juridique d'échange)
  ; hors périmètre tant que non confirmé et autorisé. Voir
  [ADR-0014](decisions/0014-prototype-fhir-r4.md).

## 14. Données fictives

**Aucune donnée réelle de patient ne doit être utilisée** à quelque étape que ce soit.
Tous les jeux de données de développement et de démonstration sont **fictifs**. Voir
[ADR-0007](decisions/0007-donnees-fictives.md).
