-- Jour 6 : moteur de rendez-vous (AppointmentSchedule, AppointmentSlot,
-- Appointment, AppointmentEvent).
--
-- Invariants portes ici en plus de schema.prisma :
--   * `Appointment_activeSlot_key` : index partiel garantissant qu'un creneau
--     ne peut avoir qu'UN SEUL rendez-vous actif (PENDING ou CONFIRMED) a la
--     fois. Une fois le rendez-vous termine (CANCELLED/COMPLETED/NO_SHOW),
--     l'index partiel ne s'applique plus et le creneau peut etre reserve a
--     nouveau. Cet index n'est pas representable dans schema.prisma (comme les
--     index trigramme de la migration add_search_indexes).

-- CreateEnum
CREATE TYPE "AppointmentScheduleStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AppointmentSlotStatus" AS ENUM ('OPEN', 'BOOKED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentEventAction" AS ENUM ('CREATED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW_MARKED');

-- CreateTable
CREATE TABLE "AppointmentSchedule" (
    "id" UUID NOT NULL,
    "affiliationId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Tunis',
    "visitDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "status" "AppointmentScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentSlot" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentSlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "patientUserId" UUID NOT NULL,
    "reason" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "actorId" UUID,
    "action" "AppointmentEventAction" NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentSchedule_status_idx" ON "AppointmentSchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentSchedule_affiliationId_key" ON "AppointmentSchedule"("affiliationId");

-- CreateIndex
CREATE INDEX "AppointmentSlot_scheduleId_status_idx" ON "AppointmentSlot"("scheduleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentSlot_scheduleId_startsAt_key" ON "AppointmentSlot"("scheduleId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_slotId_status_idx" ON "Appointment"("slotId", "status");

-- CreateIndex
CREATE INDEX "Appointment_patientUserId_status_createdAt_idx" ON "Appointment"("patientUserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_patientUserId_idempotencyKey_key" ON "Appointment"("patientUserId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_activeSlot_key" ON "Appointment"("slotId") WHERE ("status" IN ('PENDING', 'CONFIRMED'));

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "AppointmentEvent"("appointmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentSchedule" ADD CONSTRAINT "AppointmentSchedule_affiliationId_fkey" FOREIGN KEY ("affiliationId") REFERENCES "DoctorFacilityAffiliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AppointmentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;