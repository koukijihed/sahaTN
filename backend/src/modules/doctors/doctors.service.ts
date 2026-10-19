import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  CredentialType,
  CredentialVerificationStatus,
  DoctorVerificationStatus,
  FacilityAffiliationStatus,
  FacilitySector,
  FacilityType,
  Governorate,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SpecialtiesService } from '../specialties/specialties.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';
import { UpsertDoctorProfileDto } from './dto/upsert-doctor-profile.dto';

const PROFILE_INCLUDE = {
  specialties: {
    include: {
      specialty: { select: { id: true, code: true, labelFr: true, labelAr: true } }
    }
  },
  credentials: true
} satisfies Prisma.DoctorProfileInclude;

// Include public : specialites + affiliations VERIFIEES vers des etablissements
// VERIFIES et listes. Jamais de credentials, de documents ou de notes internes.
const PUBLIC_PROFILE_INCLUDE = {
  specialties: {
    include: {
      specialty: { select: { id: true, code: true, labelFr: true, labelAr: true } }
    }
  },
  affiliations: {
    where: {
      status: 'VERIFIED',
      facility: {
        verificationStatus: 'VERIFIED',
        isPubliclyListed: true
      }
    },
    select: {
      facility: {
        select: {
          id: true,
          displayName: true,
          sector: true,
          type: true,
          governorate: true,
          city: true
        }
      }
    }
  }
} satisfies Prisma.DoctorProfileInclude;

export interface SpecialtyView {
  id: string;
  code: string;
  labelFr: string;
  labelAr: string | null;
  isPrimary: boolean;
}

export interface CredentialView {
  id: string;
  type: CredentialType;
  issuingBody: string;
  reference: string | null;
  obtainedAt: Date | null;
  verificationStatus: CredentialVerificationStatus;
}

export interface DoctorProfileView {
  id: string;
  displayName: string;
  professionalDescription: string | null;
  languages: string[];
  yearsOfExperience: number | null;
  verificationStatus: DoctorVerificationStatus;
  isPubliclyListed: boolean;
  createdAt: Date;
  updatedAt: Date;
  specialties: SpecialtyView[];
  credentials: CredentialView[];
}

// Lieu d'exercice public : deduit d'une affiliation VERIFIEE vers un
// etablissement VERIFIE et publiquement liste. Aucune autre affiliation n'est
// exposee.
export interface PracticeFacilityView {
  id: string;
  displayName: string;
  sector: FacilitySector;
  type: FacilityType;
  governorate: Governorate;
  city: string;
}

export interface PublicDoctorView {
  id: string;
  displayName: string;
  professionalDescription: string | null;
  languages: string[];
  yearsOfExperience: number | null;
  specialties: SpecialtyView[];
  practiceFacilities: PracticeFacilityView[];
}

// Entree de la liste de recherche publique des medecins.
export interface DoctorSearchItemView {
  id: string;
  displayName: string;
  professionalDescription: string | null;
  languages: string[];
  yearsOfExperience: number | null;
  specialties: SpecialtyView[];
  practiceFacilities: PracticeFacilityView[];
}

export interface ProfileReference {
  id: string;
  userId: string;
  displayName: string;
  verificationStatus: DoctorVerificationStatus;
  isPubliclyListed: boolean;
}

type ProfileWithRelations = Prisma.DoctorProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly specialtiesService: SpecialtiesService
  ) {}

  private toView(profile: ProfileWithRelations): DoctorProfileView {
    return {
      id: profile.id,
      displayName: profile.displayName,
      professionalDescription: profile.professionalDescription,
      languages: profile.languages,
      yearsOfExperience: profile.yearsOfExperience,
      verificationStatus: profile.verificationStatus,
      isPubliclyListed: profile.isPubliclyListed,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      specialties: profile.specialties.map((doctorSpecialty) => ({
        id: doctorSpecialty.specialty.id,
        code: doctorSpecialty.specialty.code,
        labelFr: doctorSpecialty.specialty.labelFr,
        labelAr: doctorSpecialty.specialty.labelAr,
        isPrimary: doctorSpecialty.isPrimary
      })),
      credentials: profile.credentials.map((credential) => ({
        id: credential.id,
        type: credential.type,
        issuingBody: credential.issuingBody,
        reference: credential.reference,
        obtainedAt: credential.obtainedAt,
        verificationStatus: credential.verificationStatus
      }))
    };
  }

  async getProfileByUserId(userId: string): Promise<DoctorProfileView | null> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE
    });
    return profile ? this.toView(profile) : null;
  }

  async getProfileReferenceByUserId(
    userId: string
  ): Promise<{ id: string; verificationStatus: DoctorVerificationStatus } | null> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true }
    });
    return profile;
  }

  async getProfileById(profileId: string): Promise<ProfileReference | null> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        verificationStatus: true,
        isPubliclyListed: true
      }
    });
    return profile;
  }

  async upsertProfile(
    userId: string,
    dto: UpsertDoctorProfileDto
  ): Promise<DoctorProfileView> {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE
    });

    if (!existing) {
      return this.createProfile(userId, dto);
    }

    if (
      existing.verificationStatus === DoctorVerificationStatus.VERIFIED &&
      this.identityChanged(existing, dto)
    ) {
      throw new ConflictException(
        'Identity and specialty changes require a new verification round'
      );
    }

    const data: Prisma.DoctorProfileUpdateInput = {
      displayName: dto.displayName,
      professionalDescription: dto.professionalDescription,
      languages: dto.languages,
      yearsOfExperience: dto.yearsOfExperience
    };

    const specialtyIds = dto.specialtyIds;
    const update = this.prisma.$transaction(async (tx) => {
      await tx.doctorProfile.update({
        where: { id: existing.id },
        data
      });
      if (specialtyIds !== undefined) {
        await this.replaceSpecialties(tx, existing.id, specialtyIds);
      }
      return tx.doctorProfile.findUniqueOrThrow({
        where: { id: existing.id },
        include: PROFILE_INCLUDE
      });
    });

    return this.toView(await update);
  }

  async addCredential(
    userId: string,
    dto: CreateCredentialDto
  ): Promise<CredentialView> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!profile) {
      throw new NotFoundException('Professional profile not found');
    }
    const credential = await this.prisma.professionalCredential.create({
      data: {
        doctorProfileId: profile.id,
        type: dto.type,
        issuingBody: dto.issuingBody,
        reference: dto.reference ?? null,
        obtainedAt: dto.obtainedAt ? new Date(dto.obtainedAt) : null
      }
    });
    return this.toCredentialView(credential);
  }

  async setPublicVisibility(userId: string, listed: boolean): Promise<void> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true }
    });
    if (!profile) {
      throw new NotFoundException('Professional profile not found');
    }
    if (
      listed &&
      profile.verificationStatus !== DoctorVerificationStatus.VERIFIED
    ) {
      throw new ForbiddenException(
        'Only verified doctors can be publicly listed'
      );
    }
    await this.prisma.doctorProfile.update({
      where: { id: profile.id },
      data: { isPubliclyListed: listed }
    });
  }

  async getPublicProfile(profileId: string): Promise<PublicDoctorView> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: profileId },
      include: PUBLIC_PROFILE_INCLUDE
    });
    const isListed =
      profile &&
      profile.verificationStatus === DoctorVerificationStatus.VERIFIED &&
      profile.isPubliclyListed;
    if (!profile || !isListed) {
      // 404 sans reveler l'existence d'un profil non public.
      throw new NotFoundException('Doctor profile not found');
    }
    return {
      id: profile.id,
      displayName: profile.displayName,
      professionalDescription: profile.professionalDescription,
      languages: profile.languages,
      yearsOfExperience: profile.yearsOfExperience,
      specialties: profile.specialties.map((doctorSpecialty) => ({
        id: doctorSpecialty.specialty.id,
        code: doctorSpecialty.specialty.code,
        labelFr: doctorSpecialty.specialty.labelFr,
        labelAr: doctorSpecialty.specialty.labelAr,
        isPrimary: doctorSpecialty.isPrimary
      })),
      practiceFacilities: profile.affiliations.map((a) => a.facility)
    };
  }

  // Recherche publique des medecins verifies et publiquement listes.
  // Les filtres gouvernorat / secteur / etablissement passent exclusivement par
  // des affiliations VERIFIEES vers des etablissements VERIFIES et listes.
  async searchPublic(query: ListDoctorsQueryDto): Promise<{
    items: DoctorSearchItemView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.DoctorProfileWhereInput = {
      verificationStatus: DoctorVerificationStatus.VERIFIED,
      isPubliclyListed: true
    };

    if (query.q?.trim()) {
      where.displayName = { contains: query.q.trim(), mode: 'insensitive' };
    }
    if (query.specialtyId) {
      where.specialties = { some: { specialtyId: query.specialtyId } };
    }
    if (query.language) {
      where.languages = { has: query.language };
    }
    if (query.governorate || query.sector || query.facilityId) {
      where.affiliations = {
        some: {
          status: FacilityAffiliationStatus.VERIFIED,
          facility: {
            verificationStatus: 'VERIFIED',
            isPubliclyListed: true,
            ...(query.governorate && { governorate: query.governorate }),
            ...(query.sector && { sector: query.sector }),
            ...(query.facilityId && { id: query.facilityId })
          }
        }
      };
    }

    const orderBy: Prisma.DoctorProfileOrderByWithRelationInput =
      query.sort === 'newest' ? { createdAt: 'desc' } : { displayName: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctorProfile.findMany({
        where,
        include: PUBLIC_PROFILE_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.doctorProfile.count({ where })
    ]);

    return {
      items: items.map(this.toPublicItem.bind(this)),
      total,
      page,
      limit
    };
  }

  private toPublicItem(profile: {
    id: string;
    displayName: string;
    professionalDescription: string | null;
    languages: string[];
    yearsOfExperience: number | null;
    specialties: {
      isPrimary: boolean;
      specialty: { id: string; code: string; labelFr: string; labelAr: string | null };
    }[];
    affiliations: {
      facility: PracticeFacilityView;
    }[];
  }): DoctorSearchItemView {
    return {
      id: profile.id,
      displayName: profile.displayName,
      professionalDescription: profile.professionalDescription,
      languages: profile.languages,
      yearsOfExperience: profile.yearsOfExperience,
      specialties: profile.specialties.map((doctorSpecialty) => ({
        id: doctorSpecialty.specialty.id,
        code: doctorSpecialty.specialty.code,
        labelFr: doctorSpecialty.specialty.labelFr,
        labelAr: doctorSpecialty.specialty.labelAr,
        isPrimary: doctorSpecialty.isPrimary
      })),
      practiceFacilities: profile.affiliations.map((a) => a.facility)
    };
  }

  async setVerificationStatus(
    profileId: string,
    status: DoctorVerificationStatus,
    client: Prisma.TransactionClient
  ): Promise<void> {
    await client.doctorProfile.update({
      where: { id: profileId },
      data: { verificationStatus: status }
    });
  }

  private async createProfile(
    userId: string,
    dto: UpsertDoctorProfileDto
  ): Promise<DoctorProfileView> {
    if (!dto.displayName) {
      throw new BadRequestException(
        'displayName is required to create a professional profile'
      );
    }
    const specialtyIds = dto.specialtyIds ?? [];
    await this.assertSpecialtiesExist(specialtyIds);

    const profile = await this.prisma.doctorProfile.create({
      data: {
        userId,
        displayName: dto.displayName,
        professionalDescription: dto.professionalDescription ?? null,
        languages: dto.languages ?? [],
        yearsOfExperience: dto.yearsOfExperience ?? null,
        specialties: {
          create: specialtyIds.map((specialtyId) => ({ specialtyId }))
        }
      },
      include: PROFILE_INCLUDE
    });
    return this.toView(profile);
  }

  private async assertSpecialtiesExist(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const found = await this.specialtiesService.findActiveByIds(ids);
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more specialties are unknown');
    }
  }

  private async replaceSpecialties(
    tx: Prisma.TransactionClient,
    doctorProfileId: string,
    specialtyIds: string[]
  ): Promise<void> {
    await this.assertSpecialtiesExist(specialtyIds);
    await tx.doctorSpecialty.deleteMany({ where: { doctorProfileId } });
    if (specialtyIds.length > 0) {
      await tx.doctorSpecialty.createMany({
        data: specialtyIds.map((specialtyId) => ({ doctorProfileId, specialtyId }))
      });
    }
  }

  private identityChanged(
    profile: ProfileWithRelations,
    dto: UpsertDoctorProfileDto
  ): boolean {
    if (dto.displayName !== undefined && dto.displayName !== profile.displayName) {
      return true;
    }
    if (dto.specialtyIds !== undefined) {
      const current = profile.specialties.map((s) => s.specialtyId).sort();
      const next = [...dto.specialtyIds].sort();
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        return true;
      }
    }
    return false;
  }

  private toCredentialView(credential: {
    id: string;
    type: CredentialType;
    issuingBody: string;
    reference: string | null;
    obtainedAt: Date | null;
    verificationStatus: CredentialVerificationStatus;
  }): CredentialView {
    return {
      id: credential.id,
      type: credential.type,
      issuingBody: credential.issuingBody,
      reference: credential.reference,
      obtainedAt: credential.obtainedAt,
      verificationStatus: credential.verificationStatus
    };
  }
}