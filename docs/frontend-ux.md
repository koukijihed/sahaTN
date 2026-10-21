# Expérience utilisateur et système de design — SahaTN (Jour 13)

Ce document décrit la couche d'interface du frontend SahaTN : jetons de design,
bibliothèque de composants, châssis global, accessibilité et responsive. Il complète
[architecture.md](architecture.md) (§3.1 et §5) sans modifier les contrats d'API ni les
règles d'autorisation, qui restent entièrement côté serveur.

## 1. Principes

- **Sobriété et lisibilité** : palette limitée, hiérarchie typographique claire, densité
  maîtrisée.
- **Cohérence** : un seul jeu de composants et de jetons réutilisé sur tous les écrans.
- **Accessibilité** : contrastes, focus visible, libellés, ordre des titres, cibles
  tactiles, mouvement réduit.
- **Responsive** : mobile d'abord (≥ 360 px), tablette ~ 768 px, bureau ≥ 1280 px.
- **Confiance** : contexte médical → neutre et rassurant, sans emphase commerciale ; le
  frontend **ne décide jamais** d'une autorisation, il relaie les erreurs du serveur.

## 2. Jetons de design (`app/globals.css`)

- **Couleurs** : bleu profond (`--blue-800 #0d3b66`, `--blue-900 #0a2b4d`) comme couleur
  primaire ; turquoise (`--teal-600 #0f8a83`) comme accent ; neutres et couleurs
  sémantiques (`--success`, `--warning`, `--danger`, `--info`).
- **Typographie** : échelle de tailles, graisses et interlignes cohérents.
- **Espacement / rayons / ombres** : échelles réutilisées par les composants.
- **États** : anneau de focus (`:focus-visible`), survol, désactivé, `prefers-reduced-motion`.
- Le conteneur principal `.container` est passé à `max-width: 72rem` pour les mises en page
  larges ; les classes historiques (`.card`, `.badge`, `.form`, `.error`, `.row`, `.muted`,
  `.pagination`) restent disponibles.

## 3. Composants partagés (`components/ui.tsx`)

Composants purement présentationnels (sans `'use client'`), réutilisables côté serveur et
client :

| Composant | Rôle |
| --------- | ---- |
| `Button` / `buttonClass` | Boutons (variantes, tailles) et classes réutilisables pour les liens-boutons |
| `Card` | Conteneur de contenu |
| `Badge` / `StatusBadge` / `statusLabel` / `statusVariant` | Badges génériques et badges d'état normalisés |
| `Alert` | Message contextuel (`info`, `success`, `warning`, `danger`) |
| `PageHeader` | En-tête de page (titre + actions) |
| `Breadcrumb` | Fil d'Ariane |
| `EmptyState` / `ErrorState` / `LoadingState` | États vides, d'erreur et de chargement homogènes |
| `Pagination` | Navigation paginée |
| `StatGrid` / `Stat` | Blocs de statistiques |
| `Field` | Champ de formulaire étiqueté |

Autres composants :

- `components/auth-context.tsx` — `AuthProvider` et `useAuth` : profil connecté récupéré une
  seule fois (`/api/auth/me`), avec `refresh()` et `logout()`.
- `components/site-header.tsx` / `components/site-footer.tsx` — châssis global.
- `components/confirm-dialog.tsx` — boîte de confirmation accessible (remplace
  `window.confirm`/`window.prompt`).

## 4. Châssis global et navigation

- `app/layout.tsx` : `AuthProvider`, lien d'évitement, en-tête, conteneur `main` et pied de
  page.
- `app/dashboard/layout.tsx` : garde d'authentification (redirection vers `/login`) et
  navigation latérale **adaptée au rôle**.
- `lib/nav.ts` : `PUBLIC_NAV` et `dashboardNav(roles)` (espaces patient, praticien,
  établissement).
- `lib/labels.ts` : libellés français centralisés (gouvernorats, secteurs, types
  d'établissement).

## 5. Accessibilité

- Lien d'évitement vers le contenu principal ; `role="main"` / landmark.
- Focus visible global ; navigation clavier ; fermeture des dialogues par `Échap`.
- Libellés de formulaires associés (`Field`), messages d'erreur explicites.
- Iconographie décorative marquée `aria-hidden`.
- Remplacement des dialogues natifs bloquants par des composants accessibles.
- Respect de `prefers-reduced-motion`.

## 6. Responsive et états

- Points de rupture : 900 px (bascule de la navigation latérale), 720 px et 480 px
  (empilement des colonnes, tableaux défilants).
- Chaque écran couvre les états **chargement / vide / erreur** de manière homogène.
- Tableaux larges rendus dans un conteneur à défilement horizontal (`overflow-x: auto`).

## 7. Vérifications

- `npm run lint`, `npm run typecheck` et `npm run build` : **verts** (Jour 13).
- Contrôle de rendu (SSR) des routes publiques : réponses `200` avec en-tête et pied de page.

## 8. Tests navigateur, accessibilité et non-régression (Jour 14)

Les vérifications visuelles automatiquement outillées sont désormais en place
(**Playwright** + **axe-core**, un seul navigateur : Chromium sans interface).

- **Aucune nouvelle fonctionnalité métier ni dépendance d'exécution** : outillage
  exclusivement de développement (`@playwright/test`, `@axe-core/playwright`).
- **Harnais isolé** : `backend/test/browser/start-server.mjs` démarre une base
  éphémère (`embedded-postgres`, port `55433`, base `sahatn_browser`), applique les
  migrations, exécute le seed fictif et crée un administrateur de test, puis lance
  `dist/main.js` (port par défaut `4000`). `frontend/playwright.config.ts` orchestre
  l'ensemble (`webServer` : backend `/api/health` + `next start -p 3100`,
  `API_URL=http://localhost:4000`), un seul worker, aucune reprise.
- **Configuration** : `npm run test:e2e` (`playwright test`),
  `npm run test:e2e:report` (`playwright show-report`).
- **Couverture** (43 tests, `frontend/tests/e2e/`) :
  - `public.spec.ts` — parcours public, recherche, états vides/erreur, fiche établissement.
  - `auth.spec.ts` — inscription/connexion, message générique d'échec, mot de passe faible,
    déconnexion, session révoquée côté serveur, `401` sur API protégée.
  - `patient.spec.ts` — navigation par rôle, rendez-vous, dossier médical + compteurs,
    documents et accès, cloisonnement (aucune donnée praticien).
  - `roles.spec.ts` — espace praticien (affiliations, agenda, dossiers autorisés,
    dialogue de confirmation), établissement (gestion, refus non-gestionnaire),
    administrateur.
  - `security.spec.ts` — `401` sans session, cloisonnement entre patients, accès
    praticien borné au consentement, aucune donnée sensible dans les API publiques.
  - `accessibility.spec.ts` — analyses axe (WCAG 2.1 A/AA) sur les pages clés + lien
    d'évitement clavier.
  - `responsive.spec.ts` — menu repliable (390 px), absence de débordement horizontal,
    espace connecté mobile, navigation bureau (1280 px).
- **Corrections issues des tests** (aucun changement d'API) : restauration du focus et
  piège de tabulation dans `ConfirmDialog` ; focus déplacé par le lien d'évitement
  (`#main-content` `tabIndex={-1}`) ; contraste de `--success-700` et `.side-nav__desc` ;
  ordre de déconnexion (`router.push('/')` avant `logout()`).
- **Résiduels / limites** : violations axe documentées (voir le rapport du Jour 14) ;
  les journaux serveur peuvent afficher une violation de clé unique
  `MedicalRecord_patientUserId_key` lors du premier accès parallèle au dossier — il
  s'agit d'une **course déjà gérée** (`ensurePatientRecord` rattrape `P2002` et
  relit le dossier, cf. `record-access.service.ts`), sans impact fonctionnel.
