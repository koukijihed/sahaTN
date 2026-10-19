import { Module } from '@nestjs/common';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';

@Module({
  controllers: [TerminologyController],
  providers: [TerminologyService]
})
export class TerminologyModule {}
