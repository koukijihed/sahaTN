import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../../common/types/authenticated-request';
import { ArchiveMedicalDocumentDto } from '../dto/archive-medical-document.dto';
import { ListMedicalDocumentsQueryDto } from '../dto/list-medical-documents-query.dto';
import { UploadMedicalDocumentDto } from '../dto/upload-medical-document.dto';
import {
  MedicalDocumentDownload,
  MedicalDocumentsService,
  UploadedDocumentFile
} from './medical-documents.service';

// Plafond memoire absolu applique par multer avant meme que la validation
// metier ne s'execute. La limite effective (documentMaxFileBytes, plus basse)
// est revérifiée dans le service. Doit rester superieur ou egal au maximum
// autorise par la configuration.
const MAX_MULTIPART_BYTES = 25 * 1024 * 1024;

function contentDisposition(file: MedicalDocumentDownload): string {
  // Repli ASCII sans caracteres sensibles, plus la forme RFC 5987 pour l'Unicode.
  const fallback = file.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(file.fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function sendDocument(
  res: Response,
  file: MedicalDocumentDownload
): StreamableFile {
  res.set({
    'Content-Type': file.mimeType,
    'Content-Length': String(file.buffer.length),
    'Content-Disposition': contentDisposition(file),
    'X-Content-Type-Options': 'nosniff'
  });
  return new StreamableFile(file.buffer);
}

// ---------------------------------------------------------------- patient
// Une seule ressource "documents" par dossier. Le patient accede a ses propres
// documents sans autorisation tierce (self-access).

@ApiTags('medical-records')
@Controller('medical-records')
export class PatientMedicalDocumentsController {
  constructor(private readonly documents: MedicalDocumentsService) {}

  @Get('me/documents')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mes documents medicaux (patient)' })
  listMyDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMedicalDocumentsQueryDto
  ) {
    return this.documents.listMyDocuments(user!.id, query);
  }

  @Get('me/documents/:documentId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Metadonnees d\'un de mes documents (patient)' })
  getMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string
  ) {
    return this.documents.getMyDocument(user!.id, documentId);
  }

  @Get('me/documents/:documentId/content')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Telecharger le contenu d\'un de mes documents (patient)' })
  async downloadMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const file = await this.documents.downloadMyDocument(user!.id, documentId);
    return sendDocument(res, file);
  }

  @Post('me/documents')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MULTIPART_BYTES } }))
  @ApiOperation({ summary: 'Deposer un document dans mon dossier (patient)' })
  uploadMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: UploadMedicalDocumentDto
  ) {
    return this.documents.uploadMyDocument(user!.id, file, dto);
  }

  @Post('me/documents/:documentId/archive')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archiver un de mes documents (patient)' })
  archiveMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Body() dto: ArchiveMedicalDocumentDto
  ) {
    return this.documents.archiveMyDocument(user!.id, documentId, dto);
  }
}

// ------------------------------------------------------------ professional
// Pour un praticien, la lecture (liste/consultation/telechargement) exige
// VIEW_DOCUMENTS (ou un acces d'urgence en lecture seule). Le depot et
// l'archivage exigent WRITE_DOCUMENTS (jamais l'acces d'urgence).

@ApiTags('medical-records')
@Controller('medical-records/patients')
export class ProfessionalMedicalDocumentsController {
  constructor(private readonly documents: MedicalDocumentsService) {}

  @Get(':patientUserId/documents')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Documents d\'un patient (praticien, autorisation requise)' })
  listPatientDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ListMedicalDocumentsQueryDto
  ) {
    return this.documents.listPatientDocuments(user!.id, patientUserId, query);
  }

  @Get(':patientUserId/documents/:documentId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Metadonnees d\'un document d\'un patient (praticien, autorisation requise)'
  })
  getPatientDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Param('documentId') documentId: string
  ) {
    return this.documents.getPatientDocument(user!.id, patientUserId, documentId);
  }

  @Get(':patientUserId/documents/:documentId/content')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Telecharger un document d\'un patient (praticien, autorisation requise)'
  })
  async downloadPatientDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const file = await this.documents.downloadPatientDocument(
      user!.id,
      patientUserId,
      documentId
    );
    return sendDocument(res, file);
  }

  @Post(':patientUserId/documents')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MULTIPART_BYTES } }))
  @ApiOperation({ summary: 'Deposer un document (praticien, autorisation requise)' })
  uploadPatientDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: UploadMedicalDocumentDto
  ) {
    return this.documents.uploadPatientDocument(
      user!.id,
      patientUserId,
      file,
      dto
    );
  }

  @Post(':patientUserId/documents/:documentId/archive')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archiver un document (praticien, autorisation requise)' })
  archivePatientDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ArchiveMedicalDocumentDto
  ) {
    return this.documents.archivePatientDocument(
      user!.id,
      patientUserId,
      documentId,
      dto
    );
  }
}
