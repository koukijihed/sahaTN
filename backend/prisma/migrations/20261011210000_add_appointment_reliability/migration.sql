-- Jour 7 : fiabilite, audit et notifications des rendez-vous.
--
-- 1. `AppointmentConfirmationMode` remplace le booleen `requiresConfirmation`
--    de l'agenda (AUTOMATIC = ancien false, MANUAL = ancien true). La colonne
--    historique est supprimee apres migration des donnees.
-- 2. `AppointmentScheduleEvent` : journal append-only de configuration d'un
--    agenda (creation, changements).
-- 3. `NotificationOutbox` : file d'envoi decouplee des notifications.
-- 4. Les journaux d'audit sont rendus append-only en base (trigger refusant
--    toute mise a jour ou suppression).

-- CreateEnum
CREATE TYPE "AppointmentConfirmationMode" AS ENUM ('AUTOMATIC', 'MANUAL', 'DISABLED');

-- CreateEnum
CREATE TYPE "AppointmentScheduleEventAction" AS ENUM ('CREATED', 'UPDATED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPOINTMENT_CREATED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_REJECTED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_NO_SHOW', 'APPOINTMENT_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "AppointmentSchedule" ADD COLUMN "confirmationMode" "AppointmentConfirmationMode" NOT NULL DEFAULT 'MANUAL';

-- Backfill : l'ancien booleen est converti en mode.
UPDATE "AppointmentSchedule"
SET "confirmationMode" = CASE
    WHEN "requiresConfirmation" THEN 'MANUAL'::"AppointmentConfirmationMode"
    ELSE 'AUTOMATIC'::"AppointmentConfirmationMode"
END;

-- AlterTable
ALTER TABLE "AppointmentSchedule" DROP COLUMN "requiresConfirmation";

-- CreateTable
CREATE TABLE "AppointmentScheduleEvent" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "actorId" UUID,
    "action" "AppointmentScheduleEventAction" NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "recipientUserId" UUID NOT NULL,
    "appointmentId" UUID,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentScheduleEvent_scheduleId_createdAt_idx" ON "AppointmentScheduleEvent"("scheduleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_scheduledFor_idx" ON "NotificationOutbox"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationOutbox_recipientUserId_createdAt_idx" ON "NotificationOutbox"("recipientUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentScheduleEvent" ADD CONSTRAINT "AppointmentScheduleEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AppointmentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentScheduleEvent" ADD CONSTRAINT "AppointmentScheduleEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Jour 7 : integrite des journaux d'audit. Une ligne d'audit ne peut jamais
-- etre modifiee ni supprimee ; seul l'ajout est autorise (append-only).
CREATE OR REPLACE FUNCTION "sahatn_audit_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit journal % is append-only (% rejected)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AppointmentEvent_append_only"
    BEFORE UPDATE OR DELETE ON "AppointmentEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();

CREATE TRIGGER "AppointmentScheduleEvent_append_only"
    BEFORE UPDATE OR DELETE ON "AppointmentScheduleEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();

CREATE TRIGGER "DoctorVerificationEvent_append_only"
    BEFORE UPDATE OR DELETE ON "DoctorVerificationEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();

CREATE TRIGGER "FacilityVerificationEvent_append_only"
    BEFORE UPDATE OR DELETE ON "FacilityVerificationEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();
