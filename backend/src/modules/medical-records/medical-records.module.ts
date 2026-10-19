import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  PatientMedicalDocumentsController,
  ProfessionalMedicalDocumentsController
} from './documents/medical-documents.controller';
import { LocalPrivateDocumentStorage } from './documents/local-document-storage';
import { MEDICAL_DOCUMENT_STORAGE } from './documents/medical-document-storage';
import { MedicalDocumentsService } from './documents/medical-documents.service';
import {
  PatientMedicalRecordsController,
  ProfessionalMedicalRecordsController
} from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { RecordAccessService } from './record-access.service';

@Module({
  imports: [AuthModule, AppointmentsModule, NotificationsModule],
  controllers: [
    PatientMedicalRecordsController,
    ProfessionalMedicalRecordsController,
    PatientMedicalDocumentsController,
    ProfessionalMedicalDocumentsController
  ],
  providers: [
    MedicalRecordsService,
    RecordAccessService,
    MedicalDocumentsService,
    { provide: MEDICAL_DOCUMENT_STORAGE, useClass: LocalPrivateDocumentStorage }
  ],
  exports: [MedicalRecordsService, RecordAccessService, MedicalDocumentsService]
})
export class MedicalRecordsModule {}
