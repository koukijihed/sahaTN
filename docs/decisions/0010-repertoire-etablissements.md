# ADR-0010 — Répertoire des établissements et affiliations

- **Statut** : Accepté
- **Date** : Jour 4

## Contexte

La plateforme doit référencer les établissements de santé publics et privés (hôpitaux,
cliniques, cabinets, laboratoires, centres d'imagerie...) et relier les médecins aux
établissements où ils exercent. Comme pour les professionnels, l'accès public doit être
réservé aux établissements **vérifiés**, sans fuite d'information sur les autres.

## Décision

- **Modèle `HealthcareFacility`** : fiche d'établissement avec secteur (`PUBLIC`/
  `PRIVATE`), type (12 valeurs, ex. `UNIVERSITY_HOSPITAL`, `PRIVATE_CLINIC`),
  gouvernorat (référentiel de 24), adresse en colonnes plates, coordonnées de contact et
  références (licence, source). Deux champs contrôlent la visibilité publique :
  `verificationStatus` et `isPubliclyListed`.
- **Répertoire public en lecture seule** : liste paginée et filtrée (recherche texte,
  gouvernorat, secteur, type) et fiche détaillée ; ne renvoient que des établissements
  vérifiés **et** explicitement publiés — les autres → `404` (indiscernables).
- **Gestion (espace de gestion)** : la création d'établissement est ouverte aux
  utilisateurs authentifiés ; la modification (`PUT /facilities/:id/manage`), la
  soumission de demande de vérification et la consultation de l'historique sont réservées
  aux **gestionnaires** de l'établissement (lien `FacilityManager`, nommé **admin
  uniquement**, droits limités à la ressource — aucun rôle global créé).
- **Vérification** : workflow identique à celui des médecins (brouillon, soumission,
  transitions validées, historique **append-only**, motif requis pour refus/correction,
  décision admin uniquement, pas d'auto-décision). Contrainte d'unicité
  `activeForFacilityId` pour une seule demande active.
- **Affiliations médecin-établissement** : cycle `REQUESTED → VERIFIED/REJECTED →
  ENDED`. Un seul lien actif (`REQUESTED`/`VERIFIED`) par paire ; la contrainte
  d'unicité `(doctorProfileId, facilityId, status)` préserve l'historique. Une
  affiliation **vérifiée** est seule visible dans l'annuaire public.

## Conséquences

**Avantages**
- Même discipline que les professionnels : aucun établissement non vérifié n'apparaît
  publiquement.
- Affiliations avec audit (demandeur, décideur, clôture) et contrainte de cohérence en
  base.

**Limites**
- Adresse en colonnes plates (pas de géocodage ni normalisation poussée).
- La création reste ouverte à tout utilisateur authentifié : l'administration garde la
  maîtrise par la vérification, mais le spam d'établissements reste possible.

**Suites**
- Normalisation de l'adresse / géolocalisation (Phase 2).
- Modération et anti-spam à la création d'établissements.
- Services et horaires des établissements (Phase 3).

## Références

- Modèles et migrations : `backend/prisma/schema.prisma`
- Implémentation : `backend/src/modules/facilities/`
- Tests : `backend/test/facilities.e2e-spec.ts`