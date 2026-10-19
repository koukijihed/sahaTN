import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  DoctorAffiliationsController,
  FacilitiesController
} from './facilities.controller';
import { FacilitiesAdminController } from './facilities.admin.controller';
import { FacilitiesService } from './facilities.service';

@Module({
  imports: [AuthModule],
  controllers: [
    FacilitiesController,
    DoctorAffiliationsController,
    FacilitiesAdminController
  ],
  providers: [FacilitiesService],
  exports: [FacilitiesService]
})
export class FacilitiesModule {}