import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CsrfGuard } from './common/guards/csrf.guard';
import { OriginCheckGuard } from './common/guards/origin-check.guard';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { SpecialtiesModule } from './modules/specialties/specialties.module';
import { TerminologyModule } from './modules/terminology/terminology.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { VerificationModule } from './modules/verification/verification.module';
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { SearchModule } from './modules/search/search.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { FhirModule } from './modules/fhir/fhir.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10)
      }
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    SpecialtiesModule,
    TerminologyModule,
    DoctorsModule,
    VerificationModule,
    FacilitiesModule,
    SearchModule,
    AppointmentsModule,
    NotificationsModule,
    MedicalRecordsModule,
    FhirModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useClass: OriginCheckGuard
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard
    }
  ]
})
export class AppModule {}
