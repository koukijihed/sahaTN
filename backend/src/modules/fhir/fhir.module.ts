import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicalRecordsModule } from '../medical-records/medical-records.module';
import { FhirController } from './fhir.controller';
import { FhirR4Adapter } from './fhir-r4.adapter';
import { FhirService } from './fhir.service';
import { INTEROPERABILITY_ADAPTER } from './interoperability.port';

// Module d'interoperabilite FHIR. L'implementation de l'echange est isolee
// derriere `INTEROPERABILITY_ADAPTER` : ajouter un futur connecteur
// institutionnel consiste a fournir un autre adaptateur, sans toucher au
// service ni au controleur.
@Module({
  imports: [AuthModule, MedicalRecordsModule],
  controllers: [FhirController],
  providers: [
    FhirService,
    { provide: INTEROPERABILITY_ADAPTER, useClass: FhirR4Adapter }
  ],
  exports: [FhirService, INTEROPERABILITY_ADAPTER]
})
export class FhirModule {}
