import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  DoctorVerificationStatus,
  Prisma,
  VerificationAction,
  VerificationRequestStatus
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DoctorsService } from '../doctors/doctors.service';
import {
  VerificationDecisionAction,
  VerificationDecisionDto
} from './dto/verification-decision.dto';

const CHECKLIST_ITEMS: { code: string; label: string }[] = [
  { code: 'IDENTITY', label: 'Identite du professionnel confirmee' },
  { code: 'MEDICAL_DIPLOMA', label: 'Diplome de medecine verifie' },
  { code: 'LICENSE_REGISTRATION', label: 'Inscription professionnelle verifiee' },
  { code: 'SPECIALTY_QUALIFICATION', label: 'Qualification de specialite verifiee' },
  { code: 'PROFESSIONAL_STANDING', label: 'Situation professionnelle confirmee' }
];

interface TransitionRule {
  fromStatuses: VerificationRequestStatus[];
  fromProfile?: DoctorVerificationStatus;
}

const TRANSITIONS: Record<VerificationDecisionAction, TransitionRule> = {
  START_REVIEW: { fromStatuses: [VerificationRequestStatus.PENDING] },
  REQUEST_CORRECTION: {
    fromStatuses: [
      VerificationRequestStatus.PENDING,
      VerificationRequestStatus.UNDER_REVIEW
    ]
  },
  APPROVE: { fromStatuses: [VerificationRequestStatus.UNDER_REVIEW] },
  REJECT: { fromStatuses: [VerificationRequestStatus.UNDER_REVIEW] },
  REVOKE: {
    fromStatuses: [VerificationRequestStatus.APPROVED],
    fromProfile: DoctorVerificationStatus.VERIFIED
  }
};

const ACTIONS_REQUIRING_REASON: VerificationDecisionAction[] = [
  'REQUEST_CORRECTION',
  'REJECT',
  'REVOKE'
];

const EVENT_ACTION: Record<VerificationDecisionAction, VerificationAction> = {
  START_REVIEW: VerificationAction.REVIEW_STARTED,
  REQUEST_CORRECTION: VerificationAction.CORRECTION_REQUESTED,
  APPROVE: VerificationAction.APPROVED,
  REJECT: VerificationAction.REJECTED,
  REVOKE: VerificationAction.REVOKED
};

export interface VerificationEventView {
  id: string;
  action: VerificationAction;
  fromStatus: VerificationRequestStatus | null;
  toStatus: VerificationRequestStatus | null;
  reason: string | null;
  createdAt: Date;
  actorId: string | null;
}

export interface VerificationRequestView {
  id: string;
  status: VerificationRequestStatus;
  submittedAt: Date | null;
  decisionAt: Date | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  checklist: {
    id: string;
    code: string;
    label: string;
    isRequired: boolean;
    isChecked: boolean;
    note: string | null;
  }[];
  events: VerificationEventView[];
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctorsService: DoctorsService,
    private readonly authService: AuthService
  ) {}

  async createOrSubmit(
    userId: string,
    submit: boolean
  ): Promise<VerificationRequestView> {
    const profile = await this.doctorsService.getProfileReferenceByUserId(userId);
    if (!profile) {
      throw new BadRequestException(
        'A professional profile is required to request verification'
      );
    }

    const existingActive = await this.prisma.doctorVerificationRequest.findFirst({
      where: { activeForDoctorId: profile.id }
    });

    if (existingActive) {
      if (existingActive.status === VerificationRequestStatus.DRAFT && submit) {
        await this.prisma.$transaction(async (tx) => {
          await this.assertCompleteForSubmission(tx, profile.id);
          await tx.doctorVerificationRequest.update({
            where: { id: existingActive.id },
            data: {
              status: VerificationRequestStatus.PENDING,
              submittedAt: new Date()
            }
          });
          await tx.doctorVerificationEvent.create({
            data: {
              requestId: existingActive.id,
              actorId: userId,
              action: VerificationAction.SUBMITTED,
              fromStatus: VerificationRequestStatus.DRAFT,
              toStatus: VerificationRequestStatus.PENDING
            }
          });
          await this.doctorsService.setVerificationStatus(
            profile.id,
            DoctorVerificationStatus.PENDING,
            tx
          );
        });
        return this.getMineByRequestId(existingActive.id);
      }

      if (
        existingActive.status === VerificationRequestStatus.NEEDS_CORRECTION &&
        submit
      ) {
        await this.prisma.$transaction(async (tx) => {
          await tx.doctorVerificationRequest.update({
            where: { id: existingActive.id },
            data: {
              status: VerificationRequestStatus.PENDING,
              submittedAt: new Date()
            }
          });
          await tx.doctorVerificationEvent.create({
            data: {
              requestId: existingActive.id,
              actorId: userId,
              action: VerificationAction.RESUBMITTED,
              fromStatus: VerificationRequestStatus.NEEDS_CORRECTION,
              toStatus: VerificationRequestStatus.PENDING
            }
          });
          await this.doctorsService.setVerificationStatus(
            profile.id,
            DoctorVerificationStatus.PENDING,
            tx
          );
        });
        return this.getMineByRequestId(existingActive.id);
      }

      throw new ConflictException(
        'A verification request is already in progress'
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const status = submit
        ? VerificationRequestStatus.PENDING
        : VerificationRequestStatus.DRAFT;

      if (submit) {
        await this.assertCompleteForSubmission(tx, profile.id);
      }

      const request = await tx.doctorVerificationRequest.create({
        data: {
          doctorProfileId: profile.id,
          status,
          submittedAt: submit ? new Date() : null,
          activeForDoctorId: profile.id,
          checklist: {
            create: CHECKLIST_ITEMS.map((item) => ({
              code: item.code,
              label: item.label
            }))
          }
        }
      });

      await tx.doctorVerificationEvent.create({
        data: {
          requestId: request.id,
          actorId: userId,
          action: VerificationAction.CREATED,
          fromStatus: null,
          toStatus: VerificationRequestStatus.DRAFT
        }
      });

      if (submit) {
        await tx.doctorVerificationEvent.create({
          data: {
            requestId: request.id,
            actorId: userId,
            action: VerificationAction.SUBMITTED,
            fromStatus: VerificationRequestStatus.DRAFT,
            toStatus: VerificationRequestStatus.PENDING
          }
        });
        await this.doctorsService.setVerificationStatus(
          profile.id,
          DoctorVerificationStatus.PENDING,
          tx
        );
      }

      return request.id;
    });

    return this.getMineByRequestId(created);
  }

  async getMine(userId: string): Promise<VerificationRequestView> {
    const profile = await this.doctorsService.getProfileReferenceByUserId(userId);
    if (!profile) {
      throw new NotFoundException('No verification request found');
    }
    const request = await this.prisma.doctorVerificationRequest.findFirst({
      where: { doctorProfileId: profile.id },
      orderBy: { createdAt: 'desc' }
    });
    if (!request) {
      throw new NotFoundException('No verification request found');
    }
    return this.toView(request.id);
  }

  async listAdmin(query: {
    status?: VerificationRequestStatus;
    page: number;
    limit: number;
  }): Promise<{
    items: {
      id: string;
      status: VerificationRequestStatus;
      createdAt: Date;
      submittedAt: Date | null;
      decisionAt: Date | null;
      doctorProfile: { id: string; displayName: string; verificationStatus: DoctorVerificationStatus };
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: Prisma.DoctorVerificationRequestWhereInput = query.status
      ? { status: query.status }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctorVerificationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          doctorProfile: {
            select: { id: true, displayName: true, verificationStatus: true }
          }
        }
      }),
      this.prisma.doctorVerificationRequest.count({ where })
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.createdAt,
        submittedAt: item.submittedAt,
        decisionAt: item.decisionAt,
        doctorProfile: item.doctorProfile
      })),
      total,
      page: query.page,
      limit: query.limit
    };
  }

  async getAdminById(requestId: string) {
    const request = await this.prisma.doctorVerificationRequest.findUnique({
      where: { id: requestId },
      include: {
        doctorProfile: {
          select: {
            id: true,
            displayName: true,
            verificationStatus: true,
            isPubliclyListed: true,
            specialties: {
              include: {
                specialty: { select: { id: true, code: true, labelFr: true, labelAr: true } }
              }
            }
          }
        },
        reviewer: { select: { id: true, email: true } }
      }
    });
    if (!request) {
      throw new NotFoundException('Verification request not found');
    }
    const detail = await this.toView(requestId);
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt,
      decisionAt: request.decisionAt,
      decisionReason: request.decisionReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      reviewer: request.reviewer,
      doctorProfile: {
        id: request.doctorProfile.id,
        displayName: request.doctorProfile.displayName,
        verificationStatus: request.doctorProfile.verificationStatus,
        isPubliclyListed: request.doctorProfile.isPubliclyListed,
        specialties: request.doctorProfile.specialties.map((s) => ({
          id: s.specialty.id,
          code: s.specialty.code,
          labelFr: s.specialty.labelFr,
          labelAr: s.specialty.labelAr
        }))
      },
      checklist: detail.checklist,
      events: detail.events
    };
  }

  async decide(
    reviewerUserId: string,
    requestId: string,
    dto: VerificationDecisionDto
  ): Promise<{ id: string; status: VerificationRequestStatus }> {
    const request = await this.prisma.doctorVerificationRequest.findUnique({
      where: { id: requestId },
      include: {
        doctorProfile: {
          select: {
            id: true,
            userId: true,
            verificationStatus: true,
            isPubliclyListed: true
          }
        }
      }
    });
    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    if (request.doctorProfile.userId === reviewerUserId) {
      throw new ForbiddenException(
        'A reviewer cannot decide on their own verification request'
      );
    }

    const rule = TRANSITIONS[dto.action];
    const statusOk = rule.fromStatuses.includes(request.status);
    const profileOk =
      rule.fromProfile === undefined ||
      request.doctorProfile.verificationStatus === rule.fromProfile;

    if (!statusOk || !profileOk) {
      throw new ConflictException('Invalid status transition for this request');
    }

    if (
      ACTIONS_REQUIRING_REASON.includes(dto.action) &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required for this decision'
      );
    }

    const newStatus = this.targetStatus(dto.action);

    await this.prisma.$transaction(async (tx) => {
      const profileId = request.doctorProfile.id;
      const ownerUserId = request.doctorProfile.userId;

      if (dto.action === 'START_REVIEW') {
        await this.doctorsService.setVerificationStatus(
          profileId,
          DoctorVerificationStatus.UNDER_REVIEW,
          tx
        );
      } else if (dto.action === 'REQUEST_CORRECTION') {
        await this.doctorsService.setVerificationStatus(
          profileId,
          DoctorVerificationStatus.NEEDS_CORRECTION,
          tx
        );
      } else if (dto.action === 'APPROVE') {
        await this.doctorsService.setVerificationStatus(
          profileId,
          DoctorVerificationStatus.VERIFIED,
          tx
        );
        await this.authService.assignRole(ownerUserId, 'DOCTOR', tx);
      } else if (dto.action === 'REJECT') {
        await this.doctorsService.setVerificationStatus(
          profileId,
          DoctorVerificationStatus.REJECTED,
          tx
        );
      } else if (dto.action === 'REVOKE') {
        await this.doctorsService.setVerificationStatus(
          profileId,
          DoctorVerificationStatus.REVOKED,
          tx
        );
        await this.authService.removeRole(ownerUserId, 'DOCTOR', tx);
      }

      const isTerminal =
        newStatus === VerificationRequestStatus.APPROVED ||
        newStatus === VerificationRequestStatus.REJECTED;

      await tx.doctorVerificationRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          reviewerId: reviewerUserId,
          decisionAt: new Date(),
          decisionReason: dto.reason?.trim() || null,
          activeForDoctorId: isTerminal ? null : undefined
        }
      });

      await tx.doctorVerificationEvent.create({
        data: {
          requestId,
          actorId: reviewerUserId,
          action: EVENT_ACTION[dto.action],
          fromStatus: request.status,
          toStatus: newStatus,
          reason: dto.reason?.trim() || null
        }
      });
    });

    return { id: requestId, status: newStatus };
  }

  private targetStatus(action: VerificationDecisionAction): VerificationRequestStatus {
    switch (action) {
      case 'START_REVIEW':
        return VerificationRequestStatus.UNDER_REVIEW;
      case 'REQUEST_CORRECTION':
        return VerificationRequestStatus.NEEDS_CORRECTION;
      case 'APPROVE':
        return VerificationRequestStatus.APPROVED;
      case 'REJECT':
        return VerificationRequestStatus.REJECTED;
      case 'REVOKE':
        return VerificationRequestStatus.APPROVED;
    }
  }

  private async assertCompleteForSubmission(
    tx: Prisma.TransactionClient,
    doctorProfileId: string
  ): Promise<void> {
    const [specialtyCount, credentialCount] = await Promise.all([
      tx.doctorSpecialty.count({ where: { doctorProfileId } }),
      tx.professionalCredential.count({ where: { doctorProfileId } })
    ]);
    if (specialtyCount === 0 || credentialCount === 0) {
      throw new BadRequestException(
        'Complete the profile with at least one specialty and one credential before submitting'
      );
    }
  }

  private async toView(requestId: string): Promise<VerificationRequestView> {
    const request = await this.prisma.doctorVerificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        checklist: { orderBy: { code: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } }
      }
    });
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt,
      decisionAt: request.decisionAt,
      decisionReason: request.decisionReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      checklist: request.checklist.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
        isRequired: item.isRequired,
        isChecked: item.isChecked,
        note: item.note
      })),
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

  private async getMineByRequestId(
    requestId: string
  ): Promise<VerificationRequestView> {
    return this.toView(requestId);
  }
}