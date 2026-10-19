import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Specialty } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';

export type SpecialtyView = Pick<
  Specialty,
  'id' | 'code' | 'labelFr' | 'labelAr' | 'isActive'
>;

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<SpecialtyView[]> {
    const specialties = await this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { labelFr: 'asc' },
      select: {
        id: true,
        code: true,
        labelFr: true,
        labelAr: true,
        isActive: true
      }
    });
    return specialties;
  }

  async findActiveByIds(ids: string[]): Promise<SpecialtyView[]> {
    return this.prisma.specialty.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, code: true, labelFr: true, labelAr: true, isActive: true }
    });
  }

  async count(): Promise<number> {
    return this.prisma.specialty.count();
  }

  async create(dto: CreateSpecialtyDto): Promise<SpecialtyView> {
    const existing = await this.prisma.specialty.findUnique({
      where: { code: dto.code }
    });
    if (existing) {
      throw new ConflictException('This specialty code already exists');
    }
    const specialty = await this.prisma.specialty.create({
      data: {
        code: dto.code,
        labelFr: dto.labelFr,
        labelAr: dto.labelAr ?? null
      },
      select: { id: true, code: true, labelFr: true, labelAr: true, isActive: true }
    });
    return specialty;
  }

  async update(id: string, dto: UpdateSpecialtyDto): Promise<SpecialtyView> {
    const existing = await this.prisma.specialty.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Specialty not found');
    }
    const specialty = await this.prisma.specialty.update({
      where: { id },
      data: {
        labelFr: dto.labelFr,
        labelAr: dto.labelAr === undefined ? undefined : dto.labelAr,
        isActive: dto.isActive
      },
      select: { id: true, code: true, labelFr: true, labelAr: true, isActive: true }
    });
    return specialty;
  }
}