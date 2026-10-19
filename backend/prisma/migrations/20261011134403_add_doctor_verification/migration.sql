-- CreateEnum
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'NEEDS_CORRECTION', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "VerificationAction" AS ENUM ('CREATED', 'SUBMITTED', 'REVIEW_STARTED', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('DIPLOMA', 'MEDICAL_LICENSE', 'SPECIALTY_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "professionalDescription" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yearsOfExperience" INTEGER,
    "verificationStatus" "DoctorVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "labelAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSpecialty" (
    "doctorProfileId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorSpecialty_pkey" PRIMARY KEY ("doctorProfileId","specialtyId")
);

-- CreateTable
CREATE TABLE "ProfessionalCredential" (
    "id" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "type" "CredentialType" NOT NULL,
    "issuingBody" TEXT NOT NULL,
    "reference" TEXT,
    "obtainedAt" TIMESTAMP(3),
    "verificationStatus" "CredentialVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "verificationResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorVerificationRequest" (
    "id" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "reviewerId" UUID,
    "decisionReason" TEXT,
    "activeForDoctorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorVerificationChecklistItem" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorVerificationChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorVerificationEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID,
    "action" "VerificationAction" NOT NULL,
    "fromStatus" "VerificationRequestStatus",
    "toStatus" "VerificationRequestStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE INDEX "DoctorProfile_verificationStatus_isPubliclyListed_idx" ON "DoctorProfile"("verificationStatus", "isPubliclyListed");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");

-- CreateIndex
CREATE INDEX "Specialty_isActive_idx" ON "Specialty"("isActive");

-- CreateIndex
CREATE INDEX "DoctorSpecialty_specialtyId_idx" ON "DoctorSpecialty"("specialtyId");

-- CreateIndex
CREATE INDEX "ProfessionalCredential_doctorProfileId_idx" ON "ProfessionalCredential"("doctorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorVerificationRequest_activeForDoctorId_key" ON "DoctorVerificationRequest"("activeForDoctorId");

-- CreateIndex
CREATE INDEX "DoctorVerificationRequest_doctorProfileId_idx" ON "DoctorVerificationRequest"("doctorProfileId");

-- CreateIndex
CREATE INDEX "DoctorVerificationRequest_status_idx" ON "DoctorVerificationRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorVerificationChecklistItem_requestId_code_key" ON "DoctorVerificationChecklistItem"("requestId", "code");

-- CreateIndex
CREATE INDEX "DoctorVerificationEvent_requestId_createdAt_idx" ON "DoctorVerificationEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSpecialty" ADD CONSTRAINT "DoctorSpecialty_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSpecialty" ADD CONSTRAINT "DoctorSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalCredential" ADD CONSTRAINT "ProfessionalCredential_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalCredential" ADD CONSTRAINT "ProfessionalCredential_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationRequest" ADD CONSTRAINT "DoctorVerificationRequest_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationRequest" ADD CONSTRAINT "DoctorVerificationRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationChecklistItem" ADD CONSTRAINT "DoctorVerificationChecklistItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DoctorVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationEvent" ADD CONSTRAINT "DoctorVerificationEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DoctorVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerificationEvent" ADD CONSTRAINT "DoctorVerificationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
