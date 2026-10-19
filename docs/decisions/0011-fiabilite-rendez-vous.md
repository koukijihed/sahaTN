# ADR-0011 — Fiabilité des rendez-vous, audit append-only et notifications

- **Statut** : Accepté
- **Date** : Jour 7

## Contexte

Le cœur de la Phase 3 (agendas, créneaux, prise/annulation de rendez-vous) a été posé au
Jour 6. Trois exigences de fiabilité restaient à traiter avant d'ouvrir le parcours de
rendez-vous plus largement :

1. **Politique de confirmation explicite** : un praticien doit pouvoir choisir entre
   confirmation automatique, décision manuelle ou fermeture de la réservation en ligne.
2. **Audit non falsifiable** : les journaux d'événements (vérifications, agenda,
   rendez-vous) ne doivent pas pouvoir être modifiés ou supprimés, même par erreur
   applicative.
3. **Notifications découplées** : notifier les participants (patient, praticien) sans
   coupler le métier des rendez-vous à un fournisseur d'envoi, et sans jamais divulguer le
   motif sensible saisi par le patient.

## Décision

- **Mode de confirmation** (`AppointmentConfirmationMode`) porté par l'agenda :
  `AUTOMATIC` (le rendez-vous passe directement à `CONFIRMED`), `MANUAL` (le praticien
  décide : `CONFIRM`/`REJECT`), `DISABLED` (aucune réservation en ligne — la réservation
  renvoie `409`). Le champ historique `requiresConfirmation` est conservé en
  compatibilité (`true => MANUAL`, `false => AUTOMATIC`) ; une contradiction entre les deux
  champs est rejetée (`400`).
- **Décisions praticien** (`CONFIRM`, `REJECT`, `COMPLETE`, `NO_SHOW`) bornées par une
  **machine à états** ; le `REJECT` exige un motif. Les gestionnaires d'un établissement
  peuvent décider et configurer l'agenda pour les affiliations qu'ils administrent (droits
  limités à la ressource, aucun rôle global).
- **Audit append-only au niveau base** : une fonction `sahatn_audit_append_only` et des
  déclencheurs `BEFORE UPDATE OR DELETE` interdisent toute modification/suppression sur
  `AppointmentEvent`, `AppointmentScheduleEvent`, `DoctorVerificationEvent` et
  `FacilityVerificationEvent`. L'intégrité ne dépend donc plus seulement du code
  applicatif.
- **Notifications via une file (outbox)** : le module `notifications` expose un service
  `enqueue` qui écrit dans `NotificationOutbox` (déduplication par `dedupeKey`), découplé
  de l'agenda par une interface d'adaptateur (`NotificationChannelAdapter`). Un adaptateur
  **Noop** est branché : il marque les messages `SKIPPED` et **ne prétend jamais** les
  avoir envoyés. La livraison est déclenchée par un point d'entrée d'administration dédié.
- **Minimalité des données** : les charges utiles de notification n'incluent jamais le
  motif libre du patient ; les envois sont encapsulés pour ne jamais faire échouer la
  transaction métier.

## Conséquences

**Avantages**
- Le comportement de confirmation est explicite et testé de bout en bout (automatique,
  manuelle, désactivée, incohérence d'entrée).
- L'audit est immuable **y compris** en cas de bug applicatif (défense en profondeur).
- L'ajout d'un vrai canal (email/SMS) se fera par un nouvel adaptateur, sans toucher au
  domaine des rendez-vous.
- Aucune donnée sensible ne fuit par les notifications ou les réponses d'API.

**Limites**
- L'adaptateur Noop ne délivre rien : la livraison réelle est différée (Phase 8).
- La file reste à balayage (dispatch manuel/admin) : pas encore de planificateur
  automatique pour les rappels.
- Les déclencheurs append-only imposent de **ne jamais** supprimer de lignes d'audit (les
  suppressions métier existantes sont appelées à les éviter ; à documenter au cas par cas).

**Suites**
- Adaptateur email réel + préférences et modèle de consentement de communication.
- Planification des rappels (fenêtre avant le rendez-vous) et réessais automatiques.
- Tableau de bord d'audit et détection d'anomalies (Phase 7).

## Références

- Modèles et migration : `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/20261011210000_add_appointment_reliability/`
- Implémentation : `backend/src/modules/appointments/`,
  `backend/src/modules/notifications/`
- Tests : `backend/test/appointments.e2e-spec.ts`,
  `backend/src/modules/notifications/notifications.service.spec.ts`
