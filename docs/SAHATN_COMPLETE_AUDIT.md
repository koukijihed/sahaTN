# SahaTN — Audit complet de la plateforme

> **Portée** : audit technique et qualité, en lecture seule. Ce document **ne**
> propose **pas** de réécriture d'architecture, **ne** remet **pas** en cause les
> fondations (monolithe modulaire, autorisation contextuelle, immuabilité en
> base) et **ne** modifie **aucun** comportement existant. Il inventorie des
> constats **vérifiés** et une backlog de remédiation priorisée.
>
> **Statut** : audit réalisé le 2026-10-21. Toutes les constatations marquées
> « vérifié » ont été reproduites localement (commandes fournies en annexe A).
> Aucune donnée réelle n'est utilisée nulle part (ADR-0007).

---

## 1. Résumé exécutif

SahaTN est un monolithe modulaire NestJS + Prisma + PostgreSQL (backend) et
Next.js 14 App Router + React 18 + TypeScript strict (frontend). Le socle
sécurité est **structurellement solide** : autorisation par objet centralisée,
journal d'audit append-only scellé en **base** (déclencheurs PostgreSQL),
consentement granulaire, accès d'urgence en lecture seule, validation d'entrée
stricte (whitelist + `forbidNonWhitelisted`), sessions opaques hachées,
CSRF double soumission + vérification d'origine, limitation de débit, export
FHIR en lecture seule validé contre le schéma officiel HL7 R4.

**État de vérification (2026-10-21, local)** :

| Domaine | Résultat |
| --- | --- |
| Backend `lint` / `typecheck` | ✅ 0 erreur |
| Backend `test` (unitaires) | ✅ **201 / 201** (16 suites) |
| Backend `test:e2e` | ✅ **117 / 117** (10 suites, PostgreSQL 16 éphémère) |
| Frontend `lint` / `typecheck` | ✅ 0 erreur |
| Frontend Playwright (E2E navigateur) | ✅ **42 / 42** (Chromium) |

**Les 10 écarts les plus importants** (détail §6) :

1. **[P0] Pas de MFA/2FA** pour les comptes privilégiés (DOCTOR, ADMIN,
   FACILITY_STAFF) — identifié comme cible non implémentée (docs/security.md §2).
2. **[P0] Chiffrement au repos absent** pour le contenu des documents médicaux et
   les sauvegardes (ADR-0013 le reconnaît explicitement).
3. **[P1] Pas d'antivirus/scan de contenu** sur les documents téléversés.
4. **[P1] Aucune détection d'anomalies d'audit** (accès massifs, hors horaires) —
   Phase 7, non implémentée.
5. **[P1] Sauvegardes non exercées** : procédure de restauration documentée mais
   jamais testée.
6. **[P1] Stockage documentaire local** (`LocalPrivateDocumentStorage`) : non
   adapté à un déploiement multi-instance (pas d'objet S3-compatible).
7. **[P1] Politique de rétention / suppression / anonymisation** non définie.
8. **[P2] Swagger/CSP** : pas de CSP explicite (Helmet par défaut) et pas de test
   dédié des en-têtes de sécurité.
9. **[P2] Couverture d'accessibilité** limitée à axe-core sur les pages
   principales ; pas de budget/a11y sur flux authentifiés complexes.
10. **[P3] Hybridation des labels** : bilingue FR/AR présent dans `labels.ts` et
    `terminology`, mais l'i18n produit reste partiellement FR-only sur certaines vues.

---

## 2. Méthodologie & périmètre

- **Type** : audit statique (lecture code) + audit dynamique (exécution des
  suites de tests et des linters/builds locaux).
- **Rôles simulés** : architecte logiciel senior (structure, dette), full-stack
  (cohérence API/UI), QA (couverture et preuves), DevSecOps (CI/CD, secrets,
  chaîne d'appro), interopérabilité santé (FHIR, terminologies), UX/a11y.
- **Règle** : aucun constat n'est inventé. Chaque affirmation est rattachée à un
  fichier, une commande ou un test (annexes A et B).
- **Hors périmètre** : validation juridique (RGPD/loi tunisienne), tests de
  charge, pénétration test offensif, avis médical sur les contenus de
  terminologie.

---

## 3. Architecture & structure (vérifié)

- **Monolithe modulaire** : `backend/src/modules/*` — `auth`, `health`,
  `specialties`, `terminology`, `doctors`, `verification`, `facilities`,
  `search`, `appointments`, `notifications`, `medical-records`, `fhir`. Chaque
  module expose contrôleur + service (+ DTO). **144 fichiers TypeScript** dans
  `src/`, 16 suites unitaires.
- **Point de décision unique** : `RecordAccessService`
  (`medical-records/record-access.service.ts`) centralise l'autorisation
  clinique. Les couches métier n'autorisent jamais elles-mêmes
  (`medical-records.service.ts:140` délègue explicitement).
- **Ordre des middlewares** (`main.ts`) : `helmet` → `cookieParser` → préfixe
  global `api` → `ValidationPipe` (whitelist + `forbidNonWhitelisted` +
  transform) → filtre d'exception global → CORS (liste blanche, credentials) →
  Swagger conditionnel → écoute.
- **Gardes globaux** (`app.module.ts:51-64`) : `ThrottlerGuard`,
  `OriginCheckGuard`, `CsrfGuard`. `SessionAuthGuard` et `RolesGuard` sont
  appliqués **par route** (choix cohérent : routes publiques vs privées).
- **Frontend** : App Router, aucun `middleware.ts`, aucun
  `error.tsx`/`not-found.tsx`/`loading.tsx`, tous les écrans font leur `fetch`
  côté client via `lib/api.ts`. Rewrite `/api/:path*` → `API_URL` figé au build
  (`next.config.mjs`).

**Constats d'architecture** :

| ID | Sévérité | Constat | Preuve |
| --- | --- | --- | --- |
| ARCH-1 | P3 | Absence de `error.tsx`/`not-found.tsx`/`loading.tsx` dans l'App Router : erreurs réseau → écran non personnalisé, pas d'état de chargement unifié. | `frontend/app/**` (inventaire) |
| ARCH-2 | P3 | Toutes les pages sont des composants clients ; pas de rendu serveur des listes publiques (SEO/perf). Acceptable pour un prototype mais à noter. | `frontend/lib/api.ts` |
| ARCH-3 | P2 | `API_URL` du rewrite est figé au build : un mauvais `API_URL` en CI/prod casse silencieusement l'API côté navigateur. | `next.config.mjs:2` |
| ARCH-4 | P3 | Terminologie interne exposée via namespace `https://sahatn.example/...` non résolvable : correct pour un prototype, à remplacer par un namespace institutionnel validé. | `terminology/terminology.constants.ts` |

---

## 4. Sécurité (DevSecOps) — vérifié

### 4.1 Points forts confirmés

- **Mots de passe** : Argon2id (`@node-rs/argon2`), minimum 12 caractères avec
  lettre + chiffre ; aucun hachage exposé dans les réponses (`PublicUser`).
- **Sessions opaques** : jeton 32 octets, stocké **haché SHA-256**
  (`Session.tokenHash`), révocable (`revokedAt`).
- **Cookies** : `HttpOnly`, `SameSite=Lax`, `Secure` en production,
  `COOKIE_DOMAIN` configurable (`cookie.util.ts`).
- **CSRF** : double soumission `sahatn_csrf` + en-tête `x-csrf-token`, avec
  cache d'origine (`CsrfGuard`) ; comparaison en temps constant
  (`timingSafeEqual`) ; méthodes sûres exemptées ; `@SkipCsrf()` limité à
  `login`/`register`.
- **Vérification d'origine** sur les requêtes à état (`OriginCheckGuard`).
- **Autorisation contextuelle** : le rôle `DOCTOR`, une affiliation ou un
  rendez-vous passé ne donnent **jamais** accès ; seul un `MedicalRecordGrant`
  explicite ou un accès d'urgence (lecture seule, 24 h, justifié) le permettent.
- **Immuabilité en base** : fonctions `sahatn_audit_append_only()` et
  `sahatn_clinical_no_delete()` + déclencheurs `BEFORE UPDATE/DELETE` —
  reproduites dans les logs e2e (« append-only (UPDATE rejected) », « cannot be
  deleted »).
- **Documents** : validation par *magic bytes* (PDF/PNG/JPEG/WEBP), SHA-256
  re-vérifié au téléchargement, clé de stockage générée serveur et **jamais
  exposée**, `Content-Disposition: attachment` + `nosniff`,
  `X-Content-Type-Options` sur le flux.
- **Traversée de répertoire** bloquée (`local-document-storage.ts`
  `resolveKey`) : clés absolues, `..`, octet nul et clé vide rejetés ; écriture
  `0o600` + `flag: 'wx'` (pas d'écrasement).
- **Validation d'entrée** stricte globale ; rôle privilégié auto-attribué rejeté.
- **Anti-force brute** : verrouillage compte + throttling par route
  (`LOGIN_THROTTLE_LIMIT`, `REGISTER_THROTTLE_LIMIT`).
- **Swagger** désactivé en production par défaut (`resolveApiDocsEnabled`),
  activation explicite requise (`ENABLE_API_DOCS=true`).
- **FHIR** : projection lecture seule, aucune connexion réseau externe,
  validation contre le schéma officiel HL7 R4 archivé avec empreinte, exclusion
  explicite de `storageKey`/secrets/journal d'audit des bundles.

### 4.2 Faiblesses / risques

| ID | Sévérité | Constat | Preuve |
| --- | --- | --- | --- |
| SEC-1 | **P0** | Aucune MFA/2FA pour comptes privilégiés (DOCTOR/ADMIN/FACILITY_STAFF). Reconnu comme cible non implémentée. | `docs/security.md:37-40` |
| SEC-2 | **P0** | Aucun chiffrement au repos du contenu des documents médicaux ni des sauvegardes. | `docs/security.md:103-107`, ADR-0013 |
| SEC-3 | P1 | Pas d'antivirus/scan de contenu (malware dans un PDF/JPEG accepté valide par *magic bytes*). | ADR-0013, `docs/security.md:303-305` |
| SEC-4 | P1 | Pas de revue d'accès d'urgence **outillée** ni d'alerte admin a posteriori. | `docs/security.md:141-142` |
| SEC-5 | P1 | En-têtes de sécurité (Helmet) activés mais **aucun test dédié** ; pas de CSP explicite. | `docs/security.md:208`, `main.ts:14` |
| SEC-6 | P1 | Absence de données sensibles dans les logs **non vérifiée par test**. | `docs/security.md:209` |
| SEC-7 | P2 | `Secure` des cookies dérivé de `NODE_ENV === 'production'` (pas de `X-Forwarded-Proto`/`trust proxy`) : derrière un proxy TLS-terminé mal configuré, un déploiement « production » en HTTP casserait la connexion (cookies non posés). | `auth.controller.ts:145-147` |
| SEC-8 | P2 | `npm audit` en CI est **informatif** (`continue-on-error: true`) : une CVE haute n'échoue pas le build. | `.github/workflows/ci.yml` |
| SEC-9 | P2 | Rafraîchissement de session/CSRF absent ; TTL unique de 7 jours ; pas de rotation de jeton à la connexion sensible. | `docs/security.md:40`, `cookie.util.ts` |
| SEC-10 | P3 | Pas de pagination/plafond documenté sur certains endpoints de recherche/listing (à confirmer endpoint par endpoint). | `modules/search`, `modules/facilities` |

> **Note SEC-7** : dans le déploiement cible (Vercel front → Render backend,
> proxy `/api/*`), le backend est en HTTPS. Le point ne devient bloquant que si
> un reverse-proxy termine le TLS sans transmettre correctement le contexte. À
> traiter en config de déploiement (voir backlog DEP-2).

---

## 5. Qualité, tests & CI (vérifié)

- **Couverture fonctionnelle** : 201 tests unitaires + 117 tests e2e backend +
  42 tests Playwright frontend. Les e2e backend couvrent auth, docteurs,
  facilities, search, appointments, medical-records, medical-documents, fhir,
  terminology, health.
- **Tests négatifs présents** : refus d'accès hors contexte, révocation
  immédiate, expiration, refus hors dossiers, écriture sans repli d'urgence,
  suppression interdite (immuabilité), rejets de documents, erreurs de
  validation, auto-attribution de rôle.
- **CI** (`ci.yml`) : job backend avec Postgres 16 Alpine, `migrate deploy`,
  unit + e2e ; job frontend construit le backend et lance Playwright Chromium.
- **Observations** :
  - Les logs e2e contiennent des `ERROR` PostgreSQL attendus (chemins négatifs) :
    le bruit peut masquer une **vraie** erreur. Un mode « silencieux » des logs
    de requêtes en e2e serait utile. **(QA-1, P3)**
  - Tests de sécurité manquants explicitement listés dans `docs/security.md`
    §13 (cases non cochées) : cohérent avec SEC-5/SEC-6 + sauvegarde (SEC-4).
  - Pas de test de **charge** ni de test de **régression** sur les en-têtes de
    sécurité. **(QA-2, P2)**

---

## 6. Interopérabilité santé (vérifié)

- **FHIR R4** : convertisseurs Patient, Practitioner, Organization, Encounter,
  Condition, Observation, AllergyIntolerance, DocumentReference, Provenance.
  Bundle `validateFhirBundle` (règles SahaTN) **complété** par
  `validateFhirBundleAgainstSchema` contre le schéma HL7 officiel archivé et
  vérifié par empreinte SHA-256.
- **Terminologie** : module `terminology` interne (`TERMINOLOGY_VERSION='1.0.0'`)
  — 9 signes vitaux, sous-ensemble UCUM (7 unités), 6 catégories
  d'observations. **Aucune** terminologie sous licence (ICD/LOINC/SNOMED/ATC)
  embarquée (licensing).
- **Constats** :
  - `ClinicalObservation.code`/`unit` sont du texte libre (pas de FK
    terminologique) : acceptable pour un prototype, mais limite
    l'interopérabilité sémantique réelle. **(INT-1, P2)**
  - Identifiants internes uniquement (`urn:sahatn:identifier:*`) ; email/tél en
    `telecom`, jamais revendiqués comme identifiant national. **(INT-2, conforme
    par conception — à documenter comme limite).**
  - Aucun connecteur institutionnel réel (hors périmètre, ADR-0014).

---

## 7. UX / Accessibilité / i18n (vérifié)

- **a11y** : suite Playwright `accessibility.spec.ts` avec axe-core ; aucune
  violation bloquante détectée sur les pages couvertes.
- **Bilingue FR/AR** : `frontend/lib/labels.ts` fournit des cartes FR+AR typées
  (complétude garantie par `tsc`) pour secteur/type d'établissement/gouvernorat
  et un helper `specialtyLabel` ; `SUPPORTED_LANGUAGES` déclare 6 langues
  (`fr, ar, en, de, it, es`).
- **Constats** :
  - i18n **partiel** : seules certaines chaînes disposent d'une traduction AR ;
    la majorité de l'UI reste FR-only. **(UX-1, P3)**
  - Pas de tests a11y sur les flux authentifiés complexes (dossier, documents,
    formulaires longs). **(UX-2, P2)**
  - Pas d'états vides/erreurs/chargement standardisés (cf. ARCH-1). **(UX-3, P3)**

---

## 8. Données & référentiels (vérifié)

- **Schema** : 32 modèles, 40 enums ; **9 migrations**. Appartenances
  vérifiées : `Governorate`=24, `FacilityType`=12, `FacilitySector`=2,
  `ClinicalObservationCategory`=6.
- **Contraintes clés** : `MedicalRecord.patientUserId @unique`,
  `User_email_key`, `User_phone_key`, déclencheurs d'immuabilité.
- **Seed** (`prisma/seed.mjs`) : données **100 % fictives** ; 36 spécialités
  (source CNOM citée), 24 établissements (un par gouvernorat), comptes démo
  (`demo.doctor@sahatn.example`, `demo.staff@sahatn.example`,
  `DemoPassw0rd!2024`) ; **aucun admin seedé** (créé via script dédié) ;
  idempotent (upserts).
- **Constats** :
  - Retention/suppression/anonymisation non définies. **(DATA-1, P1)** — cf. SEC-2.
  - Libellés AR des spécialités « à valider » (source CNOM = FR). **(DATA-2,
    P3)**
  - `GENERAL_MEDICINE` label FR en ASCII (`Medecine generale`) référencé dans le
    code FHIR démo et un test e2e : couplage fragile entre seed et code.
    **(DATA-3, P3)**

---

## 9. Déploiement & exploitation (vérifié)

- **Artefacts présents** : `render.yaml` (blueprint **backend-only**, plan
  gratuit, migrations au build), `docker-compose.yml`, `backend/Dockerfile`,
  `frontend/Dockerfile`, `deploy.ps1` (local production-like, Postgres embarqué
  55435), `backend/scripts/dev-db.mjs` (Postgres persistant 55434),
  `docs/neon.md` (Postgres managé).
- **Constats** :
  - `API_URL` frontend non aligné sur l'URL backend publique (à renseigner au
    déploiement) + `CORS_ORIGIN` backend à synchroniser. **(DEP-1, P1)**
  - Cookies `Secure` dépendants de `NODE_ENV` sans gestion `trust proxy`
    (cf. SEC-7). **(DEP-2, P2)**
  - **Fichiers parasites à la racine** non suivis par git :
    `.gitignore.tmp` (artifact accidentel), `render.yaml`/`deploy.ps1` au
    niveau racine alors que le repo cible un backend-only. **(DEP-3, P3)**
  - `git push` vers `origin` (`github.com/koukijihed/sahaTN`) **non réalisé** :
    authentification GitHub interactive bloquante. **(DEP-4, P1 — opérationnel)**
  - Stockage documentaire local non partagé entre instances (cf. SEC-3). **(DEP-5,
    P1)**

---

## 10. Backlog de remédiation priorisée

> **Légende** — Sévérité : **P0** (critique), **P1** (élevé), **P2** (moyen),
> **P3** (faible). Effort : **S** (≤1 j), **M** (≤1 sem), **L** (≤1 mois),
> **XL** (>1 mois).

### P0 — Critiques

| ID | Intitulé | Constat lié | Effort | Critères d'acceptation / tests requis |
| --- | --- | --- | --- | --- |
| SEC-1 | **MFA/2FA comptes privilégiés** | §4.2 | L | Enrôlement TOTP pour DOCTOR/ADMIN/FACILITY_STAFF ; challenge au login ; e2e login sans 2e facteur refusé + avec facteur accepté ; récupération de secours. |
| SEC-2 | **Chiffrement au repos** (documents + sauvegardes) | §4.2 | L | Chiffrement enveloppe (clé par doc, KEK hors base) ; sauvegardes chiffrées ; test d'intégrité après déchiffrement ; doc clé/rotation. |

### P1 — Élevés

| ID | Intitulé | Constat lié | Effort | Critères d'acceptation / tests requis |
| --- | --- | --- | --- | --- |
| SEC-3 | **Scan antivirus des documents** | §4.2 | M | Scannage à l'upload ; rejet + audit (`DOCUMENT_REJECTED` raison bornée) ; test avec fichier EICAR. |
| SEC-4 | **Revue/alerte accès d'urgence** | §4.2 | M | Tableau admin des break-glass ; notification admin ; test e2e d'activation + visibilité admin. |
| SEC-5 | **Tests en-têtes de sécurité + CSP** | §4.2 | S | Test e2e backend sur Helmet ; CSP explicite (Next) ; test absence de `unsafe-inline` non justifié. |
| SEC-6 | **Test absence de données sensibles dans les logs** | §4.2 | S | Test qui échoue si un champ clinique/token apparaît dans les logs. |
| DATA-1 | **Politique rétention/suppression/anonymisation** | §8 | L | Document de politique + procédure d'anonymisation réversible≠ ; tests d'anonymisation sans casser l'append-only. |
| DEP-1 | **Alignement `API_URL`/`CORS_ORIGIN` au déploiement** | §9 | S | Front appelle l'API publique ; CORS restreint ; smoke test bout-en-bout en prod. |
| DEP-4 | **Auth GitHub + push `main`** | §9 | S (opérationnel) | `git push` réussi via `gh auth login` ; branche `main` à jour sur `origin`. |
| DEP-5 | **Stockage objet S3-compatible privé** | §9 | M | Abstraction `MedicalDocumentStorage` implémentée pour S3 ; tests d'intégration (URL non publique). |

### P2 — Moyens

| ID | Intitulé | Constat lié | Effort | Critères d'acceptation / tests requis |
| --- | --- | --- | --- | --- |
| SEC-7/DEP-2 | **`trust proxy` + détection HTTPS fiable** | §4.2/§9 | S | `app.set('trust proxy', ...)` config bornée ; `Secure` basé sur protocole réel ; test cookie derrière proxy simulé. |
| SEC-8 | **`npm audit` bloquant (haute)** | §4.2 | S | Passer `continue-on-error:false` (au moins sur `high`) ; build échoue sur CVE haute. |
| SEC-9 | **Rotation/rafraîchissement session & CSRF** | §4.2 | M | Rotation du jeton à la connexion sensible ; tests de non-réutilisation. |
| ARCH-3 | **Validation de `API_URL` au build** | §3 | S | Fail-fast si `API_URL` manquant/incohérent en build prod. |
| QA-2 | **Tests de régression en-têtes + budget a11y** | §5 | M | Suite dédiée ; seuils a11y bloquants en CI. |
| INT-1 | **Lien terminologique observations** | §6 | L | `code`/`unit` reliés à un référentiel (UCUM/SNOMED licencié ou interne versionné) ; tests de mapping. |
| UX-2 | **a11y flux authentifiés complexes** | §7 | M | axe-core sur dossier/documents/formulaires ; 0 violation bloquante. |

### P3 — Faibles

| ID | Intitulé | Constat lié | Effort |
| --- | --- | --- | --- |
| ARCH-1/UX-3 | `error.tsx`/`not-found.tsx`/`loading.tsx` + états vides/erreurs standardisés | §3/§7 | S |
| ARCH-2 | Étudier rendu serveur des listes publiques (SEO/perf) | §3 | M |
| ARCH-4 | Namespace terminologique institutionnel | §3 | S |
| QA-1 | Mode logs silencieux en e2e | §5 | S |
| DATA-2 | Valider les libellés AR des spécialités | §8 | S |
| DATA-3 | Découpler le seed du code FHIR démo | §8 | S |
| SEC-10 | Auditer pagination/plafonds de listing | §4.2 | S |
| DEP-3 | Nettoyer fichiers parasites racine (`.gitignore.tmp`, …) | §9 | S |
| UX-1 | Compléter l'i18n (couverture AR) | §7 | L |

---

## 11. Ordre de remédiation recommandé

1. **Immédiat (bloc P0)** : SEC-1 (MFA), SEC-2 (chiffrement au repos). Aucun
   déploiement portant des données sensibles ne devrait précéder ces sujets.
2. **Court terme (P1 sécurité/données)** : SEC-3, SEC-4, SEC-5, SEC-6, DATA-1,
   DEP-5.
3. **Déblocage opérationnel (parallélisable dès maintenant)** : DEP-4 (auth
   GitHub + push), puis DEP-1 (alignement déploiement) — nécessaires pour
   l'exposition en ligne.
4. **Moyen terme (P2)** : SEC-7, SEC-8, SEC-9, ARCH-3, QA-2, INT-1, UX-2.
5. **En continu (P3)** : hygiène repo (DEP-3), états UI (ARCH-1/UX-3),
   documentation (DATA-2/3, ARCH-4, QA-1).

---

## 12. Conclusion & limites de l'audit

Le socle est **cohérent et défendable** : les invariants de sécurité
(autorisation contextuelle, immuabilité en base, validation stricte,
minimisation des logs/notifications) sont implémentés **et testés**, y compris
sur chemins négatifs. Les écarts restants sont **majoritairement des sujets
d'industrialisation** (MFA, chiffrement au repos, antivirus, exploitation,
observabilité d'audit) plutôt que des défauts de conception.

**Limites** : audit statique + exécution locale ; pas de test de charge, pas de
pentest offensif, pas de validation juridique, pas d'expertise médicale sur les
contenus de terminologie. Les éléments de conformité réglementaire (RGPD/loi
tunisienne) **ne sont en aucun cas considérés comme acquis** sans validation
juridique (voir `docs/security.md` §10).

---

## Annexe A — Commandes de vérification (reproduites le 2026-10-21)

```powershell
# Pré-requis : Node hors PATH sur cette machine
$env:PATH = "C:\Program Files\nodejs;$env:Path"

# Backend
cd backend
npm.cmd run lint        # 0 erreur
npm.cmd run typecheck   # 0 erreur
npm.cmd test            # 16 suites, 201 passed
npm.cmd run test:e2e    # 10 suites, 117 passed (PostgreSQL 16 ephemere)

# Frontend
cd ../frontend
npm.cmd run lint        # 0 avertissement
npm.cmd run typecheck   # 0 erreur
npm.cmd run test:e2e    # 42 passed (Chromium)
```

## Annexe B — Fichiers inspectés (sélection)

- Backend : `src/main.ts`, `src/app.module.ts`,
  `src/common/guards/{csrf,origin-check,session-auth,roles}.guard.ts`,
  `src/common/cookies/cookie.util.ts`, `src/config/env.validation.ts`,
  `src/modules/auth/auth.controller.ts`,
  `src/modules/medical-records/record-access.service.ts`,
  `src/modules/medical-records/documents/{local-document-storage,medical-documents.controller}.ts`,
  `src/modules/terminology/*`, `prisma/schema.prisma`, `prisma/seed.mjs`,
  `prisma/migrations/*` (9).
- Frontend : `next.config.mjs`, `playwright.config.ts`, `lib/api.ts`,
  `lib/labels.ts`, `lib/types.ts`, `app/**` (inventaire).
- Docs : `docs/security.md`, `docs/architecture.md`, `docs/ci.md`,
  `docs/neon.md`, `docs/reference-data.md`, `docs/decisions/0001–0014`.
- Infra : `render.yaml`, `docker-compose.yml`, `backend/Dockerfile`,
  `frontend/Dockerfile`, `deploy.ps1`, `.github/workflows/ci.yml`.
