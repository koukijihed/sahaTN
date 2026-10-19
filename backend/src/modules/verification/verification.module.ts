import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AdminDoctorVerificationsController } from './admin-doctor-verifications.controller';
import { DoctorVerificationController } from './doctor-verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [AuthModule, DoctorsModule],
  controllers: [DoctorVerificationController, AdminDoctorVerificationsController],
  providers: [VerificationService],
  exports: [VerificationService]
})
export class VerificationModule {}