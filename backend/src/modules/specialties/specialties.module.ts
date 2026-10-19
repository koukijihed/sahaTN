import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpecialtiesController } from './specialties.controller';
import { SpecialtiesService } from './specialties.service';

@Module({
  imports: [AuthModule],
  controllers: [SpecialtiesController],
  providers: [SpecialtiesService],
  exports: [SpecialtiesService]
})
export class SpecialtiesModule {}