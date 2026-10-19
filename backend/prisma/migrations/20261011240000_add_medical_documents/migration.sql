-- Jour 10 : documents medicaux (metadonnees) et stockage de contenu hors base.
--
-- 1. Les portees granulaires gagnent la lecture et l'ecriture de documents :
--    un patient peut accorder la consultation des documents sans accorder le
--    depot (moindre privilege).
-- 2. Le journal d'acces recoit les actions documentaires (depot, consultation,
--    telechargement, archivage, rejet). Jamais de contenu, jamais de chemin.
-- 3. `MedicalDocument` ne porte que des METADONNEES : le contenu binaire est
--    stocke dans un espace prive, sous une cle generee par le serveur. Le type
--    MIME est declare (client) et verifie (contenu) ; une empreinte SHA-256
--    garantit l'integrite. Un document est retire LOGIQUEMENT (status ARCHIVED),
--    jamais supprime physiquement.

-- Les valeurs ajoutees aux enums existants ne sont pas utilisees dans cette
-- migration (contrainte PostgreSQL sur ALTER TYPE ... ADD VALUE en transaction).

-- AlterEnum
ALTER TYPE "RecordGrantPermission" ADD VALUE IF NOT EXISTS 'VIEW_DOCUMENTS';
ALTER TYPE "RecordGrantPermission" ADD VALUE IF NOT EXISTS 'WRITE_DOCUMENTS';

-- AlterEnum
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_UPLOADED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_VIEWED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_DOWNLOADED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_ARCHIVED';
ALTER TYPE "MedicalRecordAccessAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_REJECTED';

-- CreateEnum
CREATE TYPE "MedicalDocumentCategory" AS ENUM ('LAB_RESULT', 'IMAGING', 'REPORT', 'PRESCRIPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MedicalDocument" (
    "id" UUID NOT NULL,
    "medicalRecordId" UUID NOT NULL,
    "encounterId" UUID,
    "category" "MedicalDocumentCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "declaredMimeType" TEXT NOT NULL,
    "detectedMimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "status" "MedicalDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedByUserId" UUID NOT NULL,
    "uploaderDoctorProfileId" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" UUID,
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalDocument_storageKey_key" ON "MedicalDocument"("storageKey");

-- CreateIndex
CREATE INDEX "MedicalDocument_medicalRecordId_status_createdAt_idx" ON "MedicalDocument"("medicalRecordId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalDocument_encounterId_idx" ON "MedicalDocument"("encounterId");

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_uploaderDoctorProfileId_fkey" FOREIGN KEY ("uploaderDoctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un document a une taille positive ou nulle ; une empreinte SHA-256 exploitable
-- fait exactement 64 caracteres hexadecimaux. Le nom original est borne par le
-- code applicatif (assainissement + longueur).
ALTER TABLE "MedicalDocument"
    ADD CONSTRAINT "MedicalDocument_size_nonneg" CHECK ("sizeBytes" >= 0);

ALTER TABLE "MedicalDocument"
    ADD CONSTRAINT "MedicalDocument_checksum_length" CHECK (char_length("checksumSha256") = 64);

-- Jour 10 : pas de suppression physique silencieuse d'un document. Le retrait
-- est logique (status ARCHIVED), la tracabilite et l'integrite sont conservees.
CREATE TRIGGER "MedicalDocument_no_silent_delete"
    BEFORE DELETE ON "MedicalDocument"
    FOR EACH ROW EXECUTE FUNCTION "sahatn_clinical_no_delete"();
