import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MedicalDocumentCategory,
  MedicalDocumentStatus,
  MedicalRecordAccessAction,
  MedicalRecordAccessPurpose,
  Prisma,
  RecordGrantPermission
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecordAccessService } from '../record-access.service';
import { ArchiveMedicalDocumentDto } from '../dto/archive-medical-document.dto';
import { ListMedicalDocumentsQueryDto } from '../dto/list-medical-documents-query.dto';
import { UploadMedicalDocumentDto } from '../dto/upload-medical-document.dto';
import {
  DocumentValidationError,
  DocumentRejectionReason,
  validateDocumentContent
} from './document-validation';
import {
  MEDICAL_DOCUMENT_STORAGE,
  MedicalDocumentStorage
} from './medical-document-storage';

// Fichier recu en memoire par l'intercepteur multipart. On ne depend pas des
// types `Express.Multer.File` (paquet @types/multer absent) : on declare le
// strict necessaire, ce qui evite d'elargir la surface de confiance.
export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface MedicalDocumentView {
  id: string;
  category: MedicalDocumentCategory;
  originalName: string;
  declaredMimeType: string;
  detectedMimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: MedicalDocumentStatus;
  encounterId: string | null;
  uploadedByUserId: string;
  uploaderDoctorProfileId: string | null;
  createdAt: Date;
  archivedAt: Date | null;
  archiveReason: string | null;
}

export interface MedicalDocumentDownload {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

type ActorContext = {
  userId: string;
  doctorProfileId: string | null;
  purpose: MedicalRecordAccessPurpose;
};

// La cle de stockage est generee par le serveur, jamais derivee du nom de
// fichier fourni par l'utilisateur.
const DOCUMENT_VIEW_SELECT = {
  id: true,
  category: true,
  originalName: true,
  declaredMimeType: true,
  detectedMimeType: true,
  sizeBytes: true,
  checksumSha256: true,
  status: true,
  encounterId: true,
  uploadedByUserId: true,
  uploaderDoctorProfileId: true,
  createdAt: true,
  archivedAt: true,
  archiveReason: true
} satisfies Prisma.MedicalDocumentSelect;

type DocumentViewPayload = Prisma.MedicalDocumentGetPayload<{
  select: typeof DOCUMENT_VIEW_SELECT;
}>;

const DEFAULT_LIST_LIMIT = 50;

// Service des documents medicaux. Toutes les operations passent par le moteur
// d'autorisation existant (`RecordAccessService`). Le role DOCTOR, l'affiliation
// ou un rendez-vous ne donnent jamais acces : il faut une autorisation de
// lecture (consultation/telechargement) ou d'ecriture (depot/retrait), ou un
// acces d'urgence en lecture seule pour la consultation et le telechargement.
@Injectable()
export class MedicalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordAccess: RecordAccessService,
    private readonly config: ConfigService,
    @Inject(MEDICAL_DOCUMENT_STORAGE)
    private readonly storage: MedicalDocumentStorage
  ) {}

  private get maxBytes(): number {
    const configured = this.config.get<number>('documentMaxFileBytes');
    return typeof configured === 'number' && configured > 0
      ? configured
      : 5 * 1024 * 1024;
  }

  // --------------------------------------------------------------- patient

  async listMyDocuments(
    userId: string,
    query: ListMedicalDocumentsQueryDto
  ): Promise<MedicalDocumentView[]> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const documents = await this.findDocuments(record.id, query);
    await this.recordAccess.logAccess(record.id, {
      actorUserId: userId,
      actorDoctorProfileId: null,
      action: MedicalRecordAccessAction.DOCUMENT_VIEWED,
      purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
      targetType: 'MedicalRecordDocumentList'
    });
    return documents.map((document) => this.toView(document));
  }

  async getMyDocument(
    userId: string,
    documentId: string
  ): Promise<MedicalDocumentView> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const document = await this.findDocumentInRecord(record.id, documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    await this.recordAccess.logAccess(record.id, {
      actorUserId: userId,
      actorDoctorProfileId: null,
      action: MedicalRecordAccessAction.DOCUMENT_VIEWED,
      purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
      targetType: 'MedicalDocument',
      targetId: document.id
    });
    return this.toView(document);
  }

  async downloadMyDocument(
    userId: string,
    documentId: string
  ): Promise<MedicalDocumentDownload> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    return this.readDocumentForDownload(
      record.id,
      documentId,
      {
        userId,
        doctorProfileId: null,
        purpose: MedicalRecordAccessPurpose.PATIENT_SELF
      }
    );
  }

  async uploadMyDocument(
    userId: string,
    file: UploadedDocumentFile | undefined,
    dto: UploadMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    return this.storeDocument(
      record.id,
      { userId, doctorProfileId: null, purpose: MedicalRecordAccessPurpose.PATIENT_SELF },
      file,
      dto
    );
  }

  async archiveMyDocument(
    userId: string,
    documentId: string,
    dto: ArchiveMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    return this.archiveDocument(
      record.id,
      documentId,
      { userId, doctorProfileId: null, purpose: MedicalRecordAccessPurpose.PATIENT_SELF },
      dto
    );
  }

  // ------------------------------------------------------------ professional

  async listPatientDocuments(
    doctorUserId: string,
    patientUserId: string,
    query: ListMedicalDocumentsQueryDto
  ): Promise<MedicalDocumentView[]> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_DOCUMENTS
    );
    const documents = await this.findDocuments(authorized.record.id, query);
    await this.recordAccess.logAccess(authorized.record.id, {
      actorUserId: doctorUserId,
      actorDoctorProfileId: authorized.profile.id,
      action: MedicalRecordAccessAction.DOCUMENT_VIEWED,
      purpose: this.purposeFor(authorized.basis),
      targetType: 'MedicalRecordDocumentList'
    });
    return documents.map((document) => this.toView(document));
  }

  async getPatientDocument(
    doctorUserId: string,
    patientUserId: string,
    documentId: string
  ): Promise<MedicalDocumentView> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_DOCUMENTS
    );
    const document = await this.findDocumentInRecord(
      authorized.record.id,
      documentId
    );
    // Un identifiant de document appartenant a un autre patient ne doit jamais
    // etre distinguable d'un identifiant inexistant : on renvoie 404.
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    await this.recordAccess.logAccess(authorized.record.id, {
      actorUserId: doctorUserId,
      actorDoctorProfileId: authorized.profile.id,
      action: MedicalRecordAccessAction.DOCUMENT_VIEWED,
      purpose: this.purposeFor(authorized.basis),
      targetType: 'MedicalDocument',
      targetId: document.id
    });
    return this.toView(document);
  }

  async downloadPatientDocument(
    doctorUserId: string,
    patientUserId: string,
    documentId: string
  ): Promise<MedicalDocumentDownload> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_DOCUMENTS
    );
    return this.readDocumentForDownload(authorized.record.id, documentId, {
      userId: doctorUserId,
      doctorProfileId: authorized.profile.id,
      purpose: this.purposeFor(authorized.basis)
    });
  }

  async uploadPatientDocument(
    doctorUserId: string,
    patientUserId: string,
    file: UploadedDocumentFile | undefined,
    dto: UploadMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_DOCUMENTS
    );
    return this.storeDocument(
      authorized.record.id,
      {
        userId: doctorUserId,
        doctorProfileId: authorized.profile.id,
        purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT
      },
      file,
      dto
    );
  }

  async archivePatientDocument(
    doctorUserId: string,
    patientUserId: string,
    documentId: string,
    dto: ArchiveMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_DOCUMENTS
    );
    return this.archiveDocument(
      authorized.record.id,
      documentId,
      {
        userId: doctorUserId,
        doctorProfileId: authorized.profile.id,
        purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT
      },
      dto
    );
  }

  // -------------------------------------------------------------- internals

  private async findDocuments(
    medicalRecordId: string,
    query: ListMedicalDocumentsQueryDto
  ): Promise<DocumentViewPayload[]> {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const offset = query.offset ?? 0;
    return this.prisma.medicalDocument.findMany({
      where: {
        medicalRecordId,
        ...(query.category ? { category: query.category } : {})
      },
      select: DOCUMENT_VIEW_SELECT,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      skip: Math.max(offset, 0)
    });
  }

  private async findDocumentInRecord(
    medicalRecordId: string,
    documentId: string
  ): Promise<DocumentViewPayload | null> {
    return this.prisma.medicalDocument.findFirst({
      where: { id: documentId, medicalRecordId },
      select: DOCUMENT_VIEW_SELECT
    });
  }

  private async storeDocument(
    medicalRecordId: string,
    actor: ActorContext,
    file: UploadedDocumentFile | undefined,
    dto: UploadMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    if (!file) {
      await this.logRejection(medicalRecordId, actor, 'empty_file');
      throw new BadRequestException('A file is required');
    }

    let validated;
    try {
      validated = validateDocumentContent({
        originalName: file.originalname,
        declaredMimeType: file.mimetype,
        content: file.buffer,
        maxBytes: this.maxBytes
      });
    } catch (error) {
      if (error instanceof DocumentValidationError) {
        await this.logRejection(medicalRecordId, actor, error.reason);
        throw this.toHttpException(error);
      }
      throw error;
    }

    if (dto.encounterId) {
      const encounter = await this.prisma.clinicalEncounter.findFirst({
        where: { id: dto.encounterId, medicalRecordId },
        select: { id: true }
      });
      if (!encounter) {
        throw new BadRequestException(
          'The encounter does not belong to this patient\'s record'
        );
      }
    }

    const storageKey = this.buildStorageKey();
    const checksumSha256 = this.sha256(file.buffer);

    await this.storage.save(storageKey, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.medicalDocument.create({
          data: {
            medicalRecordId,
            encounterId: dto.encounterId ?? null,
            category: dto.category,
            originalName: validated.originalName,
            storageKey,
            declaredMimeType: validated.declaredMimeType,
            detectedMimeType: validated.detectedMimeType,
            sizeBytes: validated.sizeBytes,
            checksumSha256,
            uploadedByUserId: actor.userId,
            uploaderDoctorProfileId: actor.doctorProfileId
          },
          select: DOCUMENT_VIEW_SELECT
        });
        await tx.medicalRecordAccessEvent.create({
          data: {
            medicalRecordId,
            actorUserId: actor.userId,
            actorDoctorProfileId: actor.doctorProfileId,
            action: MedicalRecordAccessAction.DOCUMENT_UPLOADED,
            purpose: actor.purpose,
            targetType: 'MedicalDocument',
            targetId: created.id
          }
        });
        return created;
      });
    } catch (error) {
      // Le fichier a ete ecrit mais la transaction a echoue : on tente de le
      // retirer pour ne pas laisser d'orphelin.
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  private async archiveDocument(
    medicalRecordId: string,
    documentId: string,
    actor: ActorContext,
    dto: ArchiveMedicalDocumentDto
  ): Promise<MedicalDocumentView> {
    const document = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, medicalRecordId },
      select: { id: true, status: true }
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.status === MedicalDocumentStatus.ARCHIVED) {
      throw new ConflictException('Document already archived');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.medicalDocument.update({
        where: { id: document.id },
        data: {
          status: MedicalDocumentStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedByUserId: actor.userId,
          archiveReason: dto.reason?.trim() || null
        },
        select: DOCUMENT_VIEW_SELECT
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId,
          actorUserId: actor.userId,
          actorDoctorProfileId: actor.doctorProfileId,
          action: MedicalRecordAccessAction.DOCUMENT_ARCHIVED,
          purpose: actor.purpose,
          targetType: 'MedicalDocument',
          targetId: updated.id
        }
      });
      return updated;
    });
  }

  private async readDocumentForDownload(
    medicalRecordId: string,
    documentId: string,
    actor: ActorContext
  ): Promise<MedicalDocumentDownload> {
    const document = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, medicalRecordId },
      select: {
        id: true,
        storageKey: true,
        detectedMimeType: true,
        originalName: true,
        sizeBytes: true,
        checksumSha256: true,
        status: true
      }
    });
    if (!document || document.status !== MedicalDocumentStatus.ACTIVE) {
      throw new NotFoundException('Document not found');
    }

    let content: Buffer;
    try {
      content = await this.storage.read(document.storageKey);
    } catch {
      throw new InternalServerErrorException('Document content unavailable');
    }

    if (this.sha256(content) !== document.checksumSha256) {
      await this.logRejection(medicalRecordId, actor, 'integrity_failure');
      throw new InternalServerErrorException('Document integrity check failed');
    }

    await this.recordAccess.logAccess(medicalRecordId, {
      actorUserId: actor.userId,
      actorDoctorProfileId: actor.doctorProfileId,
      action: MedicalRecordAccessAction.DOCUMENT_DOWNLOADED,
      purpose: actor.purpose,
      targetType: 'MedicalDocument',
      targetId: document.id
    });

    return {
      buffer: content,
      mimeType: document.detectedMimeType,
      fileName: document.originalName,
      sizeBytes: document.sizeBytes
    };
  }

  private purposeFor(basis: 'EXPLICIT_GRANT' | 'EMERGENCY'): MedicalRecordAccessPurpose {
    return basis === 'EMERGENCY'
      ? MedicalRecordAccessPurpose.EMERGENCY
      : MedicalRecordAccessPurpose.EXPLICIT_GRANT;
  }

  private buildStorageKey(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `documents/${year}/${month}/${randomUUID()}`;
  }

  private sha256(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  // L'audit des documents est obligatoire : on ne masque jamais un echec de
  // journalisation (contrairement aux notifications, dont l'echec est toleré).
  private async logRejection(
    medicalRecordId: string,
    actor: ActorContext,
    reason: DocumentRejectionReason | 'integrity_failure'
  ): Promise<void> {
    await this.recordAccess.logAccess(medicalRecordId, {
      actorUserId: actor.userId,
      actorDoctorProfileId: actor.doctorProfileId,
      action: MedicalRecordAccessAction.DOCUMENT_REJECTED,
      purpose: actor.purpose,
      reason
    });
  }

  private toHttpException(error: DocumentValidationError): HttpException {
    switch (error.reason) {
      case 'file_too_large':
        return new PayloadTooLargeException('The file is too large');
      case 'unsupported_type':
        return new UnsupportedMediaTypeException('The file type is not supported');
      case 'type_mismatch':
        return new BadRequestException(
          'The file content does not match its declared type'
        );
      case 'empty_file':
      default:
        return new BadRequestException('The file is empty');
    }
  }

  private toView(document: DocumentViewPayload): MedicalDocumentView {
    return {
      id: document.id,
      category: document.category,
      originalName: document.originalName,
      declaredMimeType: document.declaredMimeType,
      detectedMimeType: document.detectedMimeType,
      sizeBytes: document.sizeBytes,
      checksumSha256: document.checksumSha256,
      status: document.status,
      encounterId: document.encounterId,
      uploadedByUserId: document.uploadedByUserId,
      uploaderDoctorProfileId: document.uploaderDoctorProfileId,
      createdAt: document.createdAt,
      archivedAt: document.archivedAt,
      archiveReason: document.archiveReason
    };
  }
}
