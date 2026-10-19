-- Jour 8 : fondations du dossier medical electronique (DME).
--
-- 1. `MedicalRecord` : dossier longitudinal, un par patient (unicite
--    patientUserId). Cree a la demande ; jamais supprime.
-- 2. `ClinicalEncounter` : consultation liee a un patient et a un auteur
--    professionnel (profil verifie). Lien optionnel vers un rendez-vous.
-- 3. `ClinicalObservation` / `ClinicalDiagnosis` / `PatientAllergy` : contenu
--    clinique structure, auteur professionnel, dates, statuts. La certitude
--    (KNOWN/UNKNOWN/NEGATED) distingue une information inconnue d'une reponse
--    negative explicite.
-- 4. `MedicalRecordAccessEvent` : journal d'acces append-only, sans contenu
--    clinique.
-- 5. Les tables cliniques sont protegees contre toute suppression (pas de
--    suppression definive silencieuse) : seule la correction via UPDATE est
--    possible, l'historique restant dans la table.

-- CreateEnum
CREATE TYPE "MedicalRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClinicalEntryStatus" AS ENUM ('ACTIVE', 'ENTERED_IN_ERROR');

-- CreateEnum
CREATE TYPE "ClinicalDataCertainty" AS ENUM ('KNOWN', 'UNKNOWN', 'NEGATED');

-- CreateEnum
CREATE TYPE "ClinicalEncounterType" AS ENUM ('CONSULTATION', 'FOLLOW_UP', 'TELECONSULTATION', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalObservationCategory" AS ENUM ('VITAL_SIGN', 'LABORATORY', 'SYMPTOM', 'MEASUREMENT', 'EXAM_RESULT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalDiagnosisStatus" AS ENUM ('PROVISIONAL', 'CONFIRMED', 'REFUTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergySource" AS ENUM ('PATIENT_REPORTED', 'PROFESSIONAL_DOCUMENTED', 'IMPORTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergyStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MedicalRecordAccessAction" AS ENUM ('RECORD_CREATED', 'RECORD_VIEWED', 'ENCOUNTER_CREATED', 'OBSERVATION_CREATED', 'DIAGNOSIS_CREATED', 'ALLERGY_CREATED', 'ENCOUNTER_UPDATED', 'OBSERVATION_UPDATED', 'DIAGNOSIS_UPDATED', 'ALLERGY_UPDATED');

-- CreateEnum
CREATE TYPE "MedicalRecordAccessPurpose" AS ENUM ('PATIENT_SELF', 'CARE_RELATION', 'AUTHOR', 'SYSTEM');

-- CreateTable
CREATE TABLE "MedicalRecord" (
    "id" UUID NOT NULL,
    "patientUserId" UUID NOT NULL,
    "status" "MedicalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalEncounter" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "facilityId" UUID,
    "appointmentId" UUID,
    "type" "ClinicalEncounterType" NOT NULL DEFAULT 'CONSULTATION',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "chiefComplaint" TEXT,
    "notes" TEXT,
    "recordStatus" "ClinicalEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalObservation" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "encounterId" UUID,
    "doctorProfileId" UUID NOT NULL,
    "category" "ClinicalObservationCategory" NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumeric" DOUBLE PRECISION,
    "unit" TEXT,
    "certainty" "ClinicalDataCertainty" NOT NULL DEFAULT 'KNOWN',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "recordStatus" "ClinicalEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDiagnosis" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "encounterId" UUID,
    "doctorProfileId" UUID NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" "ClinicalDiagnosisStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "diagnosedAt" TIMESTAMP(3) NOT NULL,
    "recordStatus" "ClinicalEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAllergy" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "allergen" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity",
    "source" "AllergySource" NOT NULL DEFAULT 'UNKNOWN',
    "certainty" "ClinicalDataCertainty" NOT NULL DEFAULT 'KNOWN',
    "status" "AllergyStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordStatus" "ClinicalEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecordAccessEvent" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "actorUserId" UUID,
    "actorDoctorProfileId" UUID,
    "action" "MedicalRecordAccessAction" NOT NULL,
    "purpose" "MedicalRecordAccessPurpose" NOT NULL,
    "targetType" TEXT,
    "targetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRecordAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_patientUserId_key" ON "MedicalRecord"("patientUserId");

-- CreateIndex
CREATE INDEX "MedicalRecord_status_idx" ON "MedicalRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEncounter_appointmentId_key" ON "ClinicalEncounter"("appointmentId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_medicalRecordId_occurredAt_idx" ON "ClinicalEncounter"("medicalRecordId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_doctorProfileId_idx" ON "ClinicalEncounter"("doctorProfileId");

-- CreateIndex
CREATE INDEX "ClinicalObservation_medicalRecordId_observedAt_idx" ON "ClinicalObservation"("medicalRecordId", "observedAt");

-- CreateIndex
CREATE INDEX "ClinicalObservation_encounterId_idx" ON "ClinicalObservation"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_medicalRecordId_diagnosedAt_idx" ON "ClinicalDiagnosis"("medicalRecordId", "diagnosedAt");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_encounterId_idx" ON "ClinicalDiagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "PatientAllergy_medicalRecordId_recordedAt_idx" ON "PatientAllergy"("medicalRecordId", "recordedAt");

-- CreateIndex
CREATE INDEX "MedicalRecordAccessEvent_medicalRecordId_createdAt_idx" ON "MedicalRecordAccessEvent"("medicalRecordId", "createdAt");

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthcareFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalObservation" ADD CONSTRAINT "ClinicalObservation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordAccessEvent" ADD CONSTRAINT "MedicalRecordAccessEvent_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordAccessEvent" ADD CONSTRAINT "MedicalRecordAccessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordAccessEvent" ADD CONSTRAINT "MedicalRecordAccessEvent_actorDoctorProfileId_fkey" FOREIGN KEY ("actorDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Jour 8 : integrite des journaux d'acces. Comme les autres journaux, une
-- ligne ne peut jamais etre modifiee ni supprimee (append-only).
CREATE TRIGGER "MedicalRecordAccessEvent_append_only"
    BEFORE UPDATE OR DELETE ON "MedicalRecordAccessEvent"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_audit_append_only"();

-- Jour 8 : pas de suppression definive silencieuse des donnees cliniques.
-- Seule une UPDATE (correction) est possible ; la suppression est interdite
-- en base, independamment du code applicatif.
CREATE OR REPLACE FUNCTION "sahatn_clinical_no_delete"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Clinical data % cannot be deleted (no silent deletion)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MedicalRecord_no_silent_delete"
    BEFORE DELETE ON "MedicalRecord"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "ClinicalEncounter_no_silent_delete"
    BEFORE DELETE ON "ClinicalEncounter"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "ClinicalObservation_no_silent_delete"
    BEFORE DELETE ON "ClinicalObservation"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "ClinicalDiagnosis_no_silent_delete"
    BEFORE DELETE ON "ClinicalDiagnosis"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();

CREATE TRIGGER "PatientAllergy_no_silent_delete"
    BEFORE DELETE ON "PatientAllergy"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();