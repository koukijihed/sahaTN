import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FacilitiesService } from './facilities.service';

function createMockPrisma() {
  return {
    doctorProfile: { findUnique: jest.fn() },
    healthcareFacility: { findUnique: jest.fn(), update: jest.fn() },
    facilityManager: { findUnique: jest.fn() },
    userRole: { findUnique: jest.fn() },
    doctorFacilityAffiliation: { findUnique: jest.fn(), update: jest.fn() },
    facilityVerificationRequest: { findFirst: jest.fn() },
    facilityVerificationEvent: { create: jest.fn() },
    $transaction: jest.fn()
  };
}

describe('FacilitiesService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: FacilitiesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FacilitiesService(prisma as unknown as PrismaService);
  });

  it('forbids affiliation requests from unverified doctors', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'p1',
      verificationStatus: 'UNVERIFIED'
    });
    await expect(service.requestAffiliation('u1', 'f1')).rejects.toThrow(
      ForbiddenException
    );
  });

  it('rejects an APPROVE transition outside UNDER_REVIEW with 409', async () => {
    prisma.healthcareFacility.findUnique.mockResolvedValue({
      id: 'f1',
      verificationStatus: 'PENDING'
    });
    prisma.facilityManager.findUnique.mockResolvedValue(null);
    prisma.facilityVerificationRequest.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
      activeForFacilityId: 'f1'
    });
    await expect(
      service.decide('admin1', 'f1', { action: 'APPROVE' })
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a reason to suspend a facility', async () => {
    prisma.healthcareFacility.findUnique.mockResolvedValue({
      id: 'f1',
      verificationStatus: 'VERIFIED'
    });
    prisma.facilityManager.findUnique.mockResolvedValue(null);
    await expect(
      service.decide('admin1', 'f1', { action: 'SUSPEND' })
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks identity changes on verified facilities with 409', async () => {
    prisma.healthcareFacility.findUnique
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({
        id: 'f1',
        displayName: 'Old',
        officialName: null,
        sector: 'PRIVATE',
        type: 'HOSPITAL',
        governorate: 'TUNIS',
        city: 'Tunis',
        verificationStatus: 'VERIFIED'
      });
    prisma.facilityManager.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(
      service.update('mgr1', 'f1', { displayName: 'New' })
    ).rejects.toThrow(ConflictException);
  });

  it('forbids listing a facility that is not verified', async () => {
    prisma.healthcareFacility.findUnique
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce({
        id: 'f1',
        displayName: 'Old',
        officialName: null,
        sector: 'PRIVATE',
        type: 'HOSPITAL',
        governorate: 'TUNIS',
        city: 'Tunis',
        verificationStatus: 'DRAFT'
      });
    prisma.facilityManager.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(
      service.update('mgr1', 'f1', { isPubliclyListed: true })
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires the doctor and facility to be verified before approving an affiliation', async () => {
    prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'REQUESTED',
      doctorProfile: { id: 'p1', verificationStatus: 'UNVERIFIED' },
      facility: { id: 'f1', verificationStatus: 'VERIFIED' }
    });
    await expect(
      service.decideAffiliation('admin1', 'a1', { action: 'APPROVE' })
    ).rejects.toThrow(ConflictException);
  });

  it('requires a reason to reject an affiliation', async () => {
    prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'REQUESTED',
      doctorProfile: { id: 'p1', verificationStatus: 'VERIFIED' },
      facility: { id: 'f1', verificationStatus: 'VERIFIED' }
    });
    await expect(
      service.decideAffiliation('admin1', 'a1', { action: 'REJECT' })
    ).rejects.toThrow(BadRequestException);
  });
});