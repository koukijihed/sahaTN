import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpecialtiesModule } from '../specialties/specialties.module';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [AuthModule, SpecialtiesModule],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService]
})
export class DoctorsModule {}