-- Jour 9 : autorisations d'acces, consentement et acces d'urgence.
--
-- 1. `CareRelationship` : relation de soins explicite et durable (origine :
--    rendez-vous, consentement ou systeme). Ne suffit jamais a autoriser
--    l'acces clinique a elle seule.
-- 2. `MedicalRecordGrant` : autorisation (consentement) granulaire accordee
--    par le patient a un professionnel precis, avec duree optionnelle. Une
--    seule autorisation ACTIVE par (dossier, professionnel).
-- 3. `MedicalRecordGrantEvent` : historique append-only des octrois/revocations.
-- 4. `EmergencyAccessGrant` : acces d'urgence (break-glass) en lecture seule,
--    duree strictement limitee, justification obligatoire. Une seule urgence
--    ACTIVE par (dossier, professionnel).
-- 5. Le journal d'acces recoit un code de motif borne (`reason`) et de
--    nouvelles actions (refus, vie des autorisations, urgence).
-- 6. Les journaux d'autorisations sont append-only et les tables de consentement
--    ne peuvent pas etre supprimees silencieusement (declencheurs base).

-- Les valeurs ajoutees aux enums existants ne sont pas utilisees dans cette
-- migration (contrainte PostgreSQL sur ALTER TYPE ... ADD VALUE en transaction).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EMERGENCY_ACCESS_GRANTED';

-- AlterEnum
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'ACCESS_DENIED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'GRANT_CREATED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'GRANT_REVOKED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'GRANT_EXPIRED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'EMERGENCY_ACCESS_GRANTED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'EMERGENCY_ACCESS_EXPIRED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'RELATION_ENDED';

-- AlterEnum
ALTER TYPE "MedicalRecordAccessPurpose" ADD VALUE IF NOT EXISTS 'EXPLICIT_GRANT';
ALTER TYPE "MedicalRecordAccessPurpose" ADD VALUE IF NOT EXISTS 'EMERGENCY';

-- CreateEnum
CREATE TYPE "CareRelationshipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CareRelationshipSource" AS ENUM ('APPOINTMENT', 'PATIENT_GRANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RecordGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RecordGrantPermission" AS ENUM ('VIEW_RECORD', 'VIEW_ENCOUNTERS', 'VIEW_OBSERVATIONS', 'VIEW_DIAGNOSES', 'VIEW_ALLERGIES', 'WRITE_ENCOUNTERS', 'WRITE_OBSERVATIONS', 'WRITE_DIAGNOSES', 'WRITE_ALLERGIES');

-- CreateEnum
CREATE TYPE "RecordGrantEventAction" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmergencyAccessStatus" AS ENUM ('ACTIVE', 'EXPIRED');

-- AlterTable
ALTER TABLE "MedicalRecordAccessEvent" ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "CareRelationship" (
    "id" UUID NOT NULL,
    "patientUserId" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "status" "CareRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "CareRelationshipSource" NOT NULL,
    "establishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecordGrant" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "granteeDoctorProfileId" UUID NOT NULL,
    "permissions" "RecordGrantPermission"[] DEFAULT ARRAY[]::"RecordGrantPermission"[],
    "status" "RecordGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT,
    "grantedByUserId" UUID,
    "revokedByUserId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecordGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecordGrantEvent" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "action" "RecordGrantEventAction" NOT NULL,
    "actorUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRecordGrantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyAccessGrant" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "EmergencyAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareRelationship_doctorProfileId_status_idx" ON "CareRelationship"("doctorProfileId", "status");

-- CreateIndex
CREATE INDEX "CareRelationship_patientUserId_status_idx" ON "CareRelationship"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "MedicalRecordGrant_medicalRecordId_status_idx" ON "MedicalRecordGrant"("medicalRecordId", "status");

-- CreateIndex
CREATE INDEX "MedicalRecordGrant_granteeDoctorProfileId_status_idx" ON "MedicalRecordGrant"("granteeDoctorProfileId", "status");

-- CreateIndex
CREATE INDEX "MedicalRecordGrantEvent_grantId_createdAt_idx" ON "MedicalRecordGrantEvent"("grantId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyAccessGrant_medicalRecordId_status_idx" ON "EmergencyAccessGrant"("medicalRecordId", "status");

-- CreateIndex
CREATE INDEX "EmergencyAccessGrant_doctorProfileId_status_idx" ON "EmergencyAccessGrant"("doctorProfileId", "status");

-- Contrainte d'unicite partielle : une seule relation de soins ACTIVE par
-- (patient, professionnel). L'historique des relations cloturees est conserve.
CREATE UNIQUE INDEX "CareRelationship_active_pair_key"
    ON "CareRelationship"("patientUserId", "doctorProfileId")
    WHERE "status" = 'ACTIVE';

-- Contrainte d'unicite partielle : une seule autorisation ACTIVE par
-- (dossier, professionnel). Les autorisations revoquees restent en historique.
CREATE UNIQUE INDEX "MedicalRecordGrant_active_grantee_key"
    ON "MedicalRecordGrant"("medicalRecordId", "granteeDoctorProfileId")
    WHERE "status" = 'ACTIVE';

-- Contrainte d'unicite partielle : une seule urgence ACTIVE par
-- (dossier, professionnel).
CREATE UNIQUE INDEX "EmergencyAccessGrant_active_doctor_key"
    ON "EmergencyAccessGrant"("medicalRecordId", "doctorProfileId")
    WHERE "status" = 'ACTIVE';

-- Une autorisation doit porter au moins une portee : un consentement vide
-- n'autorise rien et ne doit pas exister.
ALTER TABLE "MedicalRecordGrant"
    ADD CONSTRAINT "MedicalRecordGrant_permissions_nonempty"
    CHECK (cardinality("permissions") > 0);

-- Une urgence doit expirer apres avoir ete accordee (duree positive).
ALTER TABLE "EmergencyAccessGrant"
    ADD CONSTRAINT "EmergencyAccessGrant_window"
    CHECK ("expiresAt" > "grantedAt");

-- AddForeignKey
ALTER TABLE "CareRelationship" ADD CONSTRAINT "CareRelationship_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareRelationship" ADD CONSTRAINT "CareRelationship_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareRelationship" ADD CONSTRAINT "CareRelationship_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrant" ADD CONSTRAINT "MedicalRecordGrant_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrant" ADD CONSTRAINT "MedicalRecordGrant_granteeDoctorProfileId_fkey" FOREIGN KEY ("granteeDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrant" ADD CONSTRAINT "MedicalRecordGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrant" ADD CONSTRAINT "MedicalRecordGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrantEvent" ADD CONSTRAINT "MedicalRecordGrantEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "MedicalRecordGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordGrantEvent" ADD CONSTRAINT "MedicalRecordGrantEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Jour 9 : l'historique des autorisations est append-only (jamais modifie ni
-- supprime), comme les autres journaux du systeme.
CREATE TRIGGER "MedicalRecordGrantEvent_append_only"
    BEFORE UPDATE OR DELETE ON "MedicalRecordGrantEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();

-- Jour 9 : pas de suppression definitive silencieuse d'un consentement, d'une
-- relation de soins ou d'un acces d'urgence. Une revocation est un statut, pas
-- une suppression.
CREATE TRIGGER "MedicalRecordGrant_no_silent_delete"
    BEFORE DELETE ON "MedicalRecordGrant"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "CareRelationship_no_silent_delete"
    BEFORE DELETE ON "CareRelationship"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "EmergencyAccessGrant_no_silent_delete"
    BEFORE DELETE ON "EmergencyAccessGrant"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();
