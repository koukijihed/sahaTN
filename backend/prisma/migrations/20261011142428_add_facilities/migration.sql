-- CreateEnum
CREATE TYPE "FacilitySector" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('HOSPITAL', 'UNIVERSITY_HOSPITAL', 'REGIONAL_HOSPITAL', 'LOCAL_HOSPITAL', 'BASIC_HEALTH_CENTER', 'PRIVATE_CLINIC', 'MEDICAL_CABINET', 'MEDICAL_GROUP', 'IMAGING_CENTER', 'ANALYSIS_LABORATORY', 'SPECIALIZED_CARE_CENTER', 'OTHER');

-- CreateEnum
CREATE TYPE "Governorate" AS ENUM ('TUNIS', 'ARIANA', 'BEN_AROUS', 'MANOUBA', 'NABEUL', 'ZAGHOUAN', 'BIZERTE', 'BEJA', 'JENDOUBA', 'KEF', 'SILIANA', 'SOUSSE', 'MONASTIR', 'MAHDIA', 'SFAX', 'KAIROUAN', 'KASSERINE', 'SIDI_BOUZID', 'GABES', 'MEDENINE', 'TATAOUINE', 'GAFSA', 'TOZEUR', 'KEBILI');

-- CreateEnum
CREATE TYPE "FacilityVerificationStatus" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'NEEDS_CORRECTION', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FacilityVerificationAction" AS ENUM ('CREATED', 'SUBMITTED', 'REVIEW_STARTED', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FacilityAffiliationStatus" AS ENUM ('REQUESTED', 'VERIFIED', 'REJECTED', 'ENDED');

-- CreateTable
CREATE TABLE "HealthcareFacility" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "displayName" TEXT NOT NULL,
    "officialName" TEXT,
    "description" TEXT,
    "sector" "FacilitySector" NOT NULL,
    "type" "FacilityType" NOT NULL,
    "licenseReference" TEXT,
    "sourceReference" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "governorate" "Governorate" NOT NULL,
    "delegation" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "verificationStatus" "FacilityVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthcareFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityManager" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorFacilityAffiliation" (
    "id" UUID NOT NULL,
    "doctorProfileId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "status" "FacilityAffiliationStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "endedBy" UUID,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorFacilityAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityVerificationRequest" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "reviewerId" UUID,
    "decisionReason" TEXT,
    "activeForFacilityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityVerificationEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID,
    "facilityId" UUID NOT NULL,
    "actorId" UUID,
    "action" "FacilityVerificationAction" NOT NULL,
    "fromStatus" "FacilityVerificationStatus",
    "toStatus" "FacilityVerificationStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthcareFacility_verificationStatus_isPubliclyListed_idx" ON "HealthcareFacility"("verificationStatus", "isPubliclyListed");

-- CreateIndex
CREATE INDEX "HealthcareFacility_governorate_sector_type_idx" ON "HealthcareFacility"("governorate", "sector", "type");

-- CreateIndex
CREATE INDEX "FacilityManager_userId_idx" ON "FacilityManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityManager_facilityId_userId_key" ON "FacilityManager"("facilityId", "userId");

-- CreateIndex
CREATE INDEX "DoctorFacilityAffiliation_facilityId_status_idx" ON "DoctorFacilityAffiliation"("facilityId", "status");

-- CreateIndex
CREATE INDEX "DoctorFacilityAffiliation_doctorProfileId_status_idx" ON "DoctorFacilityAffiliation"("doctorProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorFacilityAffiliation_doctorProfileId_facilityId_status_key" ON "DoctorFacilityAffiliation"("doctorProfileId", "facilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityVerificationRequest_activeForFacilityId_key" ON "FacilityVerificationRequest"("activeForFacilityId");

-- CreateIndex
CREATE INDEX "FacilityVerificationRequest_facilityId_idx" ON "FacilityVerificationRequest"("facilityId");

-- CreateIndex
CREATE INDEX "FacilityVerificationRequest_status_idx" ON "FacilityVerificationRequest"("status");

-- CreateIndex
CREATE INDEX "FacilityVerificationEvent_facilityId_createdAt_idx" ON "FacilityVerificationEvent"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "FacilityVerificationEvent_requestId_idx" ON "FacilityVerificationEvent"("requestId");

-- AddForeignKey
ALTER TABLE "HealthcareFacility" ADD CONSTRAINT "HealthcareFacility_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityManager" ADD CONSTRAINT "FacilityManager_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthcareFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityManager" ADD CONSTRAINT "FacilityManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityManager" ADD CONSTRAINT "FacilityManager_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacilityAffiliation" ADD CONSTRAINT "DoctorFacilityAffiliation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacilityAffiliation" ADD CONSTRAINT "DoctorFacilityAffiliation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthcareFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacilityAffiliation" ADD CONSTRAINT "DoctorFacilityAffiliation_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacilityAffiliation" ADD CONSTRAINT "DoctorFacilityAffiliation_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacilityAffiliation" ADD CONSTRAINT "DoctorFacilityAffiliation_endedBy_fkey" FOREIGN KEY ("endedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityVerificationRequest" ADD CONSTRAINT "FacilityVerificationRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthcareFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityVerificationRequest" ADD CONSTRAINT "FacilityVerificationRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityVerificationEvent" ADD CONSTRAINT "FacilityVerificationEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FacilityVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityVerificationEvent" ADD CONSTRAINT "FacilityVerificationEvent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HealthcareFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityVerificationEvent" ADD CONSTRAINT "FacilityVerificationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
