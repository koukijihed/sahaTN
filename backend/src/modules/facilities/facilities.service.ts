import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  FacilityAffiliationStatus,
  FacilityVerificationAction,
  FacilityVerificationStatus,
  Prisma,
  Role,
  VerificationRequestStatus
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AffiliationDecisionDto } from './dto/affiliation-decision.dto';
import { CreateFacilityDto } from './dto/create-facility.dto';
import {
  FacilityDecisionAction,
  FacilityDecisionDto
} from './dto/facility-decision.dto';
import { GrantFacilityManagerDto } from './dto/grant-facility-manager.dto';
import { ListFacilitiesQueryDto } from './dto/list-facilities-query.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

const IDENTITY_FIELDS: (keyof CreateFacilityDto)[] = [
  'displayName',
  'officialName',
  'sector',
  'type',
  'governorate',
  'city'
];

const REQUEST_TRANSITIONS: Record<
  FacilityDecisionAction,
  { fromRequest: VerificationRequestStatus[]; fromFacility: FacilityVerificationStatus[] }
> = {
  START_REVIEW: {
    fromRequest: [VerificationRequestStatus.PENDING],
    fromFacility: [FacilityVerificationStatus.PENDING]
  },
  REQUEST_CORRECTION: {
    fromRequest: [
      VerificationRequestStatus.PENDING,
      VerificationRequestStatus.UNDER_REVIEW
    ],
    fromFacility: [
      FacilityVerificationStatus.PENDING,
      FacilityVerificationStatus.UNDER_REVIEW
    ]
  },
  APPROVE: {
    fromRequest: [VerificationRequestStatus.UNDER_REVIEW],
    fromFacility: [FacilityVerificationStatus.UNDER_REVIEW]
  },
  REJECT: {
    fromRequest: [VerificationRequestStatus.UNDER_REVIEW],
    fromFacility: [FacilityVerificationStatus.UNDER_REVIEW]
  },
  SUSPEND: {
    fromRequest: [],
    fromFacility: [FacilityVerificationStatus.SUSPENDED]
  }
};

const DECISIONS_REQUIRING_REASON: FacilityDecisionAction[] = [
  'REQUEST_CORRECTION',
  'REJECT',
  'SUSPEND'
];

const EVENT_ACTION: Record<FacilityDecisionAction, FacilityVerificationAction> = {
  START_REVIEW: FacilityVerificationAction.REVIEW_STARTED,
  REQUEST_CORRECTION: FacilityVerificationAction.CORRECTION_REQUESTED,
  APPROVE: FacilityVerificationAction.APPROVED,
  REJECT: FacilityVerificationAction.REJECTED,
  SUSPEND: FacilityVerificationAction.SUSPENDED
};

export interface FacilityEventView {
  id: string;
  action: FacilityVerificationAction;
  fromStatus: FacilityVerificationStatus | null;
  toStatus: FacilityVerificationStatus | null;
  reason: string | null;
  createdAt: Date;
  actorId: string | null;
}

export interface FacilityRequestView {
  id: string;
  status: VerificationRequestStatus;
  submittedAt: Date | null;
  decisionAt: Date | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  events: FacilityEventView[];
}

export interface FacilityView {
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  sector: string;
  type: string;
  licenseReference: string | null;
  sourceReference: string | null;
  addressLine: string;
  city: string;
  governorate: string;
  delegation: string | null;
  postalCode: string | null;
  phone: string | null;
  websiteUrl: string | null;
  verificationStatus: FacilityVerificationStatus;
  isPubliclyListed: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  managers: {
    id: string;
    userId: string;
    grantedBy: string | null;
    createdAt: Date;
  }[];
  latestVerificationRequest: FacilityRequestView | null;
}

export interface AffiliatedDoctorView {
  id: string;
  displayName: string;
  specialties: {
    id: string;
    code: string;
    labelFr: string;
    labelAr: string | null;
  }[];
}

export interface PublicFacilityView {
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  sector: string;
  type: string;
  addressLine: string;
  city: string;
  governorate: string;
  delegation: string | null;
  postalCode: string | null;
  phone: string | null;
  websiteUrl: string | null;
  verifiedAffiliations?: {
    id: string;
    doctorProfile: AffiliatedDoctorView;
  }[];
}

export interface FacilityListItemView {
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  sector: string;
  type: string;
  governorate: string;
  city: string;
  delegation: string | null;
  postalCode: string | null;
  addressLine: string;
  phone: string | null;
  websiteUrl: string | null;
}

export interface AffiliationView {
  id: string;
  status: FacilityAffiliationStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  doctorProfile: {
    id: string;
    displayName: string;
    verificationStatus: string;
  };
  facility: {
    id: string;
    displayName: string;
    sector: string;
    type: string;
    governorate: string;
    city: string;
    verificationStatus: FacilityVerificationStatus;
    isPubliclyListed: boolean;
  };
}

const FACILITY_VIEW_SELECT = {
  id: true,
  displayName: true,
  officialName: true,
  description: true,
  sector: true,
  type: true,
  licenseReference: true,
  sourceReference: true,
  addressLine: true,
  city: true,
  governorate: true,
  delegation: true,
  postalCode: true,
  phone: true,
  websiteUrl: true,
  verificationStatus: true,
  isPubliclyListed: true,
  lastVerifiedAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.HealthcareFacilitySelect;

type FacilitySelectPayload = Prisma.HealthcareFacilityGetPayload<{
  select: typeof FACILITY_VIEW_SELECT;
}>;

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ public

  async listPublic(query: ListFacilitiesQueryDto): Promise<{
    items: FacilityListItemView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HealthcareFacilityWhereInput = {
      verificationStatus: FacilityVerificationStatus.VERIFIED,
      isPubliclyListed: true
    };

    if (query.governorate) {
      where.governorate = query.governorate;
    }
    if (query.sector) {
      where.sector = query.sector;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { officialName: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } }
      ];
    }
    if (query.specialtyId) {
      where.affiliations = {
        some: {
          status: FacilityAffiliationStatus.VERIFIED,
          doctorProfile: {
            verificationStatus: 'VERIFIED',
            specialties: { some: { specialtyId: query.specialtyId } }
          }
        }
      };
    }

    const orderBy: Prisma.HealthcareFacilityOrderByWithRelationInput =
      query.sort === 'newest' ? { createdAt: 'desc' } : { displayName: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.healthcareFacility.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          officialName: true,
          description: true,
          sector: true,
          type: true,
          governorate: true,
          city: true,
          delegation: true,
          postalCode: true,
          addressLine: true,
          phone: true,
          websiteUrl: true
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.healthcareFacility.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async getPublicById(id: string): Promise<PublicFacilityView> {
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id },
      include: {
        affiliations: {
          where: { status: FacilityAffiliationStatus.VERIFIED },
          select: {
            id: true,
            doctorProfile: {
              select: {
                id: true,
                displayName: true,
                verificationStatus: true,
                specialties: {
                  select: {
                    specialty: {
                      select: { id: true, code: true, labelFr: true, labelAr: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const isListed =
      facility &&
      facility.verificationStatus === FacilityVerificationStatus.VERIFIED &&
      facility.isPubliclyListed;

    if (!facility || !isListed) {
      // 404 sans reveler l'existence d'un etablissement non public.
      throw new NotFoundException('Facility not found');
    }

    return {
      id: facility.id,
      displayName: facility.displayName,
      officialName: facility.officialName,
      description: facility.description,
      sector: facility.sector,
      type: facility.type,
      addressLine: facility.addressLine,
      city: facility.city,
      governorate: facility.governorate,
      delegation: facility.delegation,
      postalCode: facility.postalCode,
      phone: facility.phone,
      websiteUrl: facility.websiteUrl,
      verifiedAffiliations: facility.affiliations
        .filter((a) => a.doctorProfile.verificationStatus === 'VERIFIED')
        .map((a) => ({
          id: a.id,
          doctorProfile: {
            id: a.doctorProfile.id,
            displayName: a.doctorProfile.displayName,
            specialties: a.doctorProfile.specialties.map((s) => s.specialty)
          }
        }))
    };
  }

  // ------------------------------------------------------ gestion (responsable)

  async create(userId: string, dto: CreateFacilityDto): Promise<FacilityView> {
    if (!dto.displayName) {
      throw new BadRequestException('displayName is required to create a facility');
    }
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.healthcareFacility.create({
        data: {
          ownerUserId: userId,
          displayName: dto.displayName,
          officialName: dto.officialName ?? null,
          description: dto.description ?? null,
          sector: dto.sector,
          type: dto.type,
          licenseReference: dto.licenseReference ?? null,
          sourceReference: dto.sourceReference ?? null,
          addressLine: dto.addressLine,
          city: dto.city,
          governorate: dto.governorate,
          delegation: dto.delegation ?? null,
          postalCode: dto.postalCode ?? null,
          phone: dto.phone ?? null,
          websiteUrl: dto.websiteUrl ?? null
        },
        select: { id: true }
      });

      const request = await tx.facilityVerificationRequest.create({
        data: {
          facilityId: facility.id,
          status: VerificationRequestStatus.DRAFT,
          activeForFacilityId: facility.id
        }
      });

      await tx.facilityVerificationEvent.create({
        data: {
          requestId: request.id,
          facilityId: facility.id,
          actorId: userId,
          action: FacilityVerificationAction.CREATED,
          fromStatus: null,
          toStatus: FacilityVerificationStatus.DRAFT
        }
      });

      return tx.healthcareFacility.findUniqueOrThrow({
        where: { id: facility.id },
        select: { ...FACILITY_VIEW_SELECT, managers: true }
      });
    }).then((facility) => this.toView(facility, true));
  }

  async getManageById(userId: string, facilityId: string): Promise<FacilityView> {
    await this.assertManager(userId, facilityId);
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { ...FACILITY_VIEW_SELECT, managers: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }
    return this.toView(facility, true);
  }

  async update(
    userId: string,
    facilityId: string,
    dto: UpdateFacilityDto
  ): Promise<FacilityView> {
    await this.assertManager(userId, facilityId);
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: FACILITY_VIEW_SELECT
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }

    if (
      facility.verificationStatus === FacilityVerificationStatus.VERIFIED &&
      this.identityChanged(facility, dto)
    ) {
      throw new ConflictException(
        'Identity changes require a new verification round'
      );
    }

    if (
      dto.isPubliclyListed === true &&
      facility.verificationStatus !== FacilityVerificationStatus.VERIFIED
    ) {
      throw new ForbiddenException(
        'Only verified facilities can be publicly listed'
      );
    }

    const data: Prisma.HealthcareFacilityUpdateInput = {
      displayName: dto.displayName,
      officialName: dto.officialName === undefined ? undefined : dto.officialName,
      description: dto.description === undefined ? undefined : dto.description,
      sector: dto.sector,
      type: dto.type,
      licenseReference:
        dto.licenseReference === undefined ? undefined : dto.licenseReference,
      sourceReference:
        dto.sourceReference === undefined ? undefined : dto.sourceReference,
      addressLine: dto.addressLine,
      city: dto.city,
      governorate: dto.governorate,
      delegation: dto.delegation === undefined ? undefined : dto.delegation,
      postalCode: dto.postalCode === undefined ? undefined : dto.postalCode,
      phone: dto.phone === undefined ? undefined : dto.phone,
      websiteUrl: dto.websiteUrl === undefined ? undefined : dto.websiteUrl,
      isPubliclyListed: dto.isPubliclyListed
    };

    await this.prisma.healthcareFacility.update({
      where: { id: facilityId },
      data
    });

    return this.getManageById(userId, facilityId);
  }

  async createOrSubmitVerification(
    userId: string,
    facilityId: string,
    submit = true
  ): Promise<FacilityRequestView> {
    await this.assertManager(userId, facilityId);
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { id: true, verificationStatus: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }

    const active = await this.prisma.facilityVerificationRequest.findFirst({
      where: { activeForFacilityId: facilityId }
    });

    if (active) {
      if (active.status === VerificationRequestStatus.DRAFT && submit) {
        await this.prisma.$transaction(async (tx) => {
          await tx.facilityVerificationRequest.update({
            where: { id: active.id },
            data: {
              status: VerificationRequestStatus.PENDING,
              submittedAt: new Date()
            }
          });
          await tx.facilityVerificationEvent.create({
            data: {
              requestId: active.id,
              facilityId,
              actorId: userId,
              action: FacilityVerificationAction.SUBMITTED,
              fromStatus: FacilityVerificationStatus.DRAFT,
              toStatus: FacilityVerificationStatus.PENDING
            }
          });
          await this.setFacilityVerificationStatus(
            facilityId,
            FacilityVerificationStatus.PENDING,
            tx
          );
        });
        return this.getFacilityRequestView(active.id);
      }

      if (
        active.status === VerificationRequestStatus.NEEDS_CORRECTION &&
        submit
      ) {
        await this.prisma.$transaction(async (tx) => {
          await tx.facilityVerificationRequest.update({
            where: { id: active.id },
            data: {
              status: VerificationRequestStatus.PENDING,
              submittedAt: new Date()
            }
          });
          await tx.facilityVerificationEvent.create({
            data: {
              requestId: active.id,
              facilityId,
              actorId: userId,
              action: FacilityVerificationAction.RESUBMITTED,
              fromStatus: FacilityVerificationStatus.NEEDS_CORRECTION,
              toStatus: FacilityVerificationStatus.PENDING
            }
          });
          await this.setFacilityVerificationStatus(
            facilityId,
            FacilityVerificationStatus.PENDING,
            tx
          );
        });
        return this.getFacilityRequestView(active.id);
      }

      throw new ConflictException(
        'A verification request is already in progress'
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const status = submit
        ? VerificationRequestStatus.PENDING
        : VerificationRequestStatus.DRAFT;

      const request = await tx.facilityVerificationRequest.create({
        data: {
          facilityId,
          status,
          submittedAt: submit ? new Date() : null,
          activeForFacilityId: facilityId
        }
      });

      await tx.facilityVerificationEvent.create({
        data: {
          requestId: request.id,
          facilityId,
          actorId: userId,
          action: FacilityVerificationAction.CREATED,
          fromStatus: null,
          toStatus: FacilityVerificationStatus.DRAFT
        }
      });

      if (submit) {
        await tx.facilityVerificationEvent.create({
          data: {
            requestId: request.id,
            facilityId,
            actorId: userId,
            action: FacilityVerificationAction.SUBMITTED,
            fromStatus: FacilityVerificationStatus.DRAFT,
            toStatus: FacilityVerificationStatus.PENDING
          }
        });
        await this.setFacilityVerificationStatus(
          facilityId,
          FacilityVerificationStatus.PENDING,
          tx
        );
      }

      return request.id;
    });

    return this.getFacilityRequestView(created);
  }

  // ------------------------------------------------- affiliations (medecin)

  async requestAffiliation(
    userId: string,
    facilityId: string
  ): Promise<AffiliationView> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true }
    });
    if (!profile) {
      throw new BadRequestException(
        'A professional profile is required to request an affiliation'
      );
    }
    if (profile.verificationStatus !== 'VERIFIED') {
      throw new ForbiddenException(
        'Only verified doctors can request an affiliation'
      );
    }

    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { id: true, verificationStatus: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }
    if (facility.verificationStatus === FacilityVerificationStatus.SUSPENDED) {
      throw new ConflictException('The facility is suspended');
    }

    const activeAffiliation =
      await this.prisma.doctorFacilityAffiliation.findFirst({
        where: {
          doctorProfileId: profile.id,
          facilityId,
          status: { in: [FacilityAffiliationStatus.REQUESTED, FacilityAffiliationStatus.VERIFIED] }
        }
      });
    if (activeAffiliation) {
      throw new ConflictException(
        'An affiliation is already active with this facility'
      );
    }

    const affiliation = await this.prisma.doctorFacilityAffiliation.create({
      data: {
        doctorProfileId: profile.id,
        facilityId,
        requestedBy: userId
      }
    });
    return this.toAffiliationView(affiliation.id);
  }

  async listMyAffiliations(userId: string): Promise<AffiliationView[]> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!profile) {
      return [];
    }
    const affiliations = await this.prisma.doctorFacilityAffiliation.findMany({
      where: { doctorProfileId: profile.id },
      orderBy: { createdAt: 'desc' }
    });
    return Promise.all(
      affiliations.map((affiliation) =>
        this.toAffiliationView(affiliation.id)
      )
    );
  }

  async endAffiliation(
    userId: string,
    facilityId: string,
    affiliationId: string
  ): Promise<{ id: string; status: FacilityAffiliationStatus }> {
    const affiliation = await this.prisma.doctorFacilityAffiliation.findFirst({
      where: { id: affiliationId, facilityId },
      select: {
        id: true,
        status: true,
        requestedBy: true,
        doctorProfile: { select: { userId: true } }
      }
    });
    if (!affiliation) {
      throw new NotFoundException('Affiliation not found');
    }

    const isActorAllowed =
      affiliation.requestedBy === userId ||
      affiliation.doctorProfile.userId === userId ||
      (await this.isManagerOrAdmin(userId, facilityId));
    if (!isActorAllowed) {
      throw new ForbiddenException('Not allowed to end this affiliation');
    }

    if (
      affiliation.status !== FacilityAffiliationStatus.REQUESTED &&
      affiliation.status !== FacilityAffiliationStatus.VERIFIED
    ) {
      throw new ConflictException('This affiliation is not active');
    }

    const updated = await this.prisma.doctorFacilityAffiliation.update({
      where: { id: affiliationId },
      data: {
        status: FacilityAffiliationStatus.ENDED,
        endDate: new Date(),
        endedBy: userId
      }
    });
    return { id: updated.id, status: updated.status };
  }

  // --------------------------------------------------------- administration

  async listAdmin(
    query: { status?: FacilityVerificationStatus; page: number; limit: number }
  ): Promise<{
    items: {
      id: string;
      displayName: string;
      sector: string;
      type: string;
      city: string;
      governorate: string;
      verificationStatus: FacilityVerificationStatus;
      isPubliclyListed: boolean;
      createdAt: Date;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: Prisma.HealthcareFacilityWhereInput = query.status
      ? { verificationStatus: query.status }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.healthcareFacility.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          sector: true,
          type: true,
          city: true,
          governorate: true,
          verificationStatus: true,
          isPubliclyListed: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.healthcareFacility.count({ where })
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async getAdminById(facilityId: string): Promise<FacilityView> {
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { ...FACILITY_VIEW_SELECT, managers: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }
    return this.toView(facility, true);
  }

  async decide(
    reviewerUserId: string,
    facilityId: string,
    dto: FacilityDecisionDto
  ): Promise<{ id: string; status: FacilityVerificationStatus }> {
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { id: true, verificationStatus: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }

    if (await this.isManager(facilityId, reviewerUserId)) {
      throw new ForbiddenException(
        'An administrator cannot decide on a facility they manage'
      );
    }

    const active = await this.prisma.facilityVerificationRequest.findFirst({
      where: { activeForFacilityId: facilityId }
    });

    if (dto.action !== 'SUSPEND') {
      if (!active) {
        throw new ConflictException('No verification request is in progress');
      }
      const requestOk = REQUEST_TRANSITIONS[dto.action].fromRequest.includes(active.status);
      const facilityOk = REQUEST_TRANSITIONS[dto.action].fromFacility.includes(
        facility.verificationStatus
      );
      if (!requestOk || !facilityOk) {
        throw new ConflictException('Invalid status transition for this request');
      }
    } else if (facility.verificationStatus === FacilityVerificationStatus.SUSPENDED) {
      throw new ConflictException('The facility is already suspended');
    }

    if (
      DECISIONS_REQUIRING_REASON.includes(dto.action) &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException('A reason is required for this decision');
    }

    const newFacilityStatus = this.facilityTargetStatus(dto.action);

    await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'APPROVE') {
        await tx.healthcareFacility.update({
          where: { id: facilityId },
          data: {
            verificationStatus: FacilityVerificationStatus.VERIFIED,
            lastVerifiedAt: new Date()
          }
        });
      } else {
        await tx.healthcareFacility.update({
          where: { id: facilityId },
          data: { verificationStatus: newFacilityStatus }
        });
      }

      if (dto.action !== 'SUSPEND' && active) {
        const newRequestStatus = this.requestTargetStatus(dto.action);
        const isTerminal =
          newRequestStatus === VerificationRequestStatus.APPROVED ||
          newRequestStatus === VerificationRequestStatus.REJECTED;

        await tx.facilityVerificationRequest.update({
          where: { id: active.id },
          data: {
            status: newRequestStatus,
            reviewerId: reviewerUserId,
            decisionAt: new Date(),
            decisionReason: dto.reason?.trim() || null,
            activeForFacilityId: isTerminal ? null : undefined
          }
        });
      } else if (dto.action === 'SUSPEND' && active) {
        // La suspension clot la demande en cours sans statut intermediaire :
        // on detache la demande active pour permettre une nouvelle soumission.
        await tx.facilityVerificationRequest.update({
          where: { id: active.id },
          data: {
            reviewerId: reviewerUserId,
            decisionAt: new Date(),
            decisionReason: dto.reason?.trim() || null,
            activeForFacilityId: null
          }
        });
      }

      await tx.facilityVerificationEvent.create({
        data: {
          requestId: active ? active.id : null,
          facilityId,
          actorId: reviewerUserId,
          action: EVENT_ACTION[dto.action],
          fromStatus: facility.verificationStatus,
          toStatus: newFacilityStatus,
          reason: dto.reason?.trim() || null
        }
      });
    });

    return { id: facilityId, status: newFacilityStatus };
  }

  async grantManager(
    adminId: string,
    facilityId: string,
    dto: GrantFacilityManagerDto
  ): Promise<{ id: string; facilityId: string; userId: string; createdAt: Date }> {
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { id: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }

    const existing = await this.prisma.facilityManager.findUnique({
      where: { facilityId_userId: { facilityId, userId: dto.userId } }
    });
    if (existing) {
      throw new ConflictException('This user already manages the facility');
    }

    const manager = await this.prisma.facilityManager.create({
      data: { facilityId, userId: dto.userId, grantedBy: adminId }
    });
    return {
      id: manager.id,
      facilityId: manager.facilityId,
      userId: manager.userId,
      createdAt: manager.createdAt
    };
  }

  async removeManager(
    facilityId: string,
    userId: string
  ): Promise<{ removed: boolean }> {
    const existing = await this.prisma.facilityManager.findUnique({
      where: { facilityId_userId: { facilityId, userId } }
    });
    if (!existing) {
      throw new NotFoundException('This user does not manage the facility');
    }
    await this.prisma.facilityManager.delete({
      where: { facilityId_userId: { facilityId, userId } }
    });
    return { removed: true };
  }

  async decideAffiliation(
    adminId: string,
    affiliationId: string,
    dto: AffiliationDecisionDto
  ): Promise<{ id: string; status: FacilityAffiliationStatus }> {
    const affiliation = await this.prisma.doctorFacilityAffiliation.findUnique({
      where: { id: affiliationId },
      include: {
        doctorProfile: {
          select: { id: true, verificationStatus: true }
        },
        facility: {
          select: { id: true, verificationStatus: true }
        }
      }
    });
    if (!affiliation) {
      throw new NotFoundException('Affiliation not found');
    }
    if (
      dto.action === 'REJECT' &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException('A reason is required to reject an affiliation');
    }
    if (affiliation.status !== FacilityAffiliationStatus.REQUESTED) {
      throw new ConflictException('Affiliation is not awaiting a decision');
    }

    let newStatus: FacilityAffiliationStatus;
    if (dto.action === 'REJECT') {
      newStatus = FacilityAffiliationStatus.REJECTED;
    } else {
      if (
        affiliation.doctorProfile.verificationStatus !== 'VERIFIED' ||
        affiliation.facility.verificationStatus !== FacilityVerificationStatus.VERIFIED
      ) {
        throw new ConflictException(
          'A verified doctor and facility are required to approve an affiliation'
        );
      }
      newStatus = FacilityAffiliationStatus.VERIFIED;
    }

    const updated = await this.prisma.doctorFacilityAffiliation.update({
      where: { id: affiliationId },
      data: {
        status: newStatus,
        decidedBy: adminId,
        decidedAt: new Date(),
        decisionReason: dto.reason?.trim() || null
      }
    });
    return { id: updated.id, status: updated.status };
  }

  // ---------------------------------------------------------------- helpers

  private async assertManager(userId: string, facilityId: string): Promise<void> {
    const facility = await this.prisma.healthcareFacility.findUnique({
      where: { id: facilityId },
      select: { id: true }
    });
    if (!facility) {
      throw new NotFoundException('Facility not found');
    }
    if (!(await this.isManagerOrAdmin(userId, facilityId))) {
      throw new ForbiddenException('You do not manage this facility');
    }
  }

  private async isManagerOrAdmin(userId: string, facilityId: string): Promise<boolean> {
    if (await this.isManager(facilityId, userId)) {
      return true;
    }
    const admin = await this.prisma.userRole.findUnique({
      where: { userId_role: { userId, role: Role.ADMIN } }
    });
    return admin !== null;
  }

  private async isManager(facilityId: string, userId: string): Promise<boolean> {
    const manager = await this.prisma.facilityManager.findUnique({
      where: { facilityId_userId: { facilityId, userId } }
    });
    return manager !== null;
  }

  private async setFacilityVerificationStatus(
    facilityId: string,
    status: FacilityVerificationStatus,
    client: Prisma.TransactionClient
  ): Promise<void> {
    await client.healthcareFacility.update({
      where: { id: facilityId },
      data: { verificationStatus: status }
    });
  }

  private identityChanged(
    facility: FacilitySelectPayload,
    dto: UpdateFacilityDto
  ): boolean {
    for (const field of IDENTITY_FIELDS) {
      const value = dto[field];
      if (value !== undefined && value !== facility[field]) {
        return true;
      }
    }
    return false;
  }

  private async toView(
    facility: FacilitySelectPayload & { managers: { id: string; userId: string; grantedBy: string | null; createdAt: Date }[] },
    withManagers: boolean
  ): Promise<FacilityView> {
    const latestRequest = await this.prisma.facilityVerificationRequest.findFirst({
      where: { facilityId: facility.id },
      orderBy: { createdAt: 'desc' }
    });
    return {
      id: facility.id,
      displayName: facility.displayName,
      officialName: facility.officialName,
      description: facility.description,
      sector: facility.sector,
      type: facility.type,
      licenseReference: facility.licenseReference,
      sourceReference: facility.sourceReference,
      addressLine: facility.addressLine,
      city: facility.city,
      governorate: facility.governorate,
      delegation: facility.delegation,
      postalCode: facility.postalCode,
      phone: facility.phone,
      websiteUrl: facility.websiteUrl,
      verificationStatus: facility.verificationStatus,
      isPubliclyListed: facility.isPubliclyListed,
      lastVerifiedAt: facility.lastVerifiedAt,
      createdAt: facility.createdAt,
      updatedAt: facility.updatedAt,
      managers: withManagers ? facility.managers : [],
      latestVerificationRequest: latestRequest
        ? await this.getFacilityRequestView(latestRequest.id)
        : null
    };
  }

  private async getFacilityRequestView(
    requestId: string
  ): Promise<FacilityRequestView> {
    const request = await this.prisma.facilityVerificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { events: { orderBy: { createdAt: 'asc' } } }
    });
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt,
      decisionAt: request.decisionAt,
      decisionReason: request.decisionReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      events: request.events.map((event) => ({
        id: event.id,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        createdAt: event.createdAt,
        actorId: event.actorId
      }))
    };
  }

  private async toAffiliationView(id: string): Promise<AffiliationView> {
    const affiliation =
      await this.prisma.doctorFacilityAffiliation.findUniqueOrThrow({
        where: { id },
        include: {
          doctorProfile: { select: { id: true, displayName: true, verificationStatus: true } },
          facility: {
            select: {
              id: true,
              displayName: true,
              sector: true,
              type: true,
              governorate: true,
              city: true,
              verificationStatus: true,
              isPubliclyListed: true
            }
          }
        }
      });
    return {
      id: affiliation.id,
      status: affiliation.status,
      requestedAt: affiliation.requestedAt,
      decidedAt: affiliation.decidedAt,
      decisionReason: affiliation.decisionReason,
      endDate: affiliation.endDate,
      createdAt: affiliation.createdAt,
      updatedAt: affiliation.updatedAt,
      doctorProfile: affiliation.doctorProfile,
      facility: affiliation.facility
    };
  }

  private requestTargetStatus(
    action: FacilityDecisionAction
  ): VerificationRequestStatus {
    switch (action) {
      case 'START_REVIEW':
        return VerificationRequestStatus.UNDER_REVIEW;
      case 'REQUEST_CORRECTION':
        return VerificationRequestStatus.NEEDS_CORRECTION;
      case 'APPROVE':
        return VerificationRequestStatus.APPROVED;
      case 'REJECT':
        return VerificationRequestStatus.REJECTED;
      case 'SUSPEND':
        return VerificationRequestStatus.PENDING;
    }
  }

  private facilityTargetStatus(
    action: FacilityDecisionAction
  ): FacilityVerificationStatus {
    switch (action) {
      case 'START_REVIEW':
        return FacilityVerificationStatus.UNDER_REVIEW;
      case 'REQUEST_CORRECTION':
        return FacilityVerificationStatus.NEEDS_CORRECTION;
      case 'APPROVE':
        return FacilityVerificationStatus.VERIFIED;
      case 'REJECT':
        return FacilityVerificationStatus.REJECTED;
      case 'SUSPEND':
        return FacilityVerificationStatus.SUSPENDED;
    }
  }
}