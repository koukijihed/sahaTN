import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module';
import { FacilitiesModule } from '../facilities/facilities.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [DoctorsModule, FacilitiesModule],
  controllers: [SearchController],
  providers: [SearchService]
})
export class SearchModule {}