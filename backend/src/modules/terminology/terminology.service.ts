import { Injectable } from '@nestjs/common';
import {
  ObservationDefinition,
  OBSERVATION_CATALOGUE,
  SAHATN_TERMINOLOGY_SYSTEM,
  TERMINOLOGY_VERSION,
  UnitDefinition,
  UCUM_UNITS,
  VITAL_SIGNS
} from './terminology.constants';

export interface ObservationCatalogueView {
  system: string;
  version: string;
  items: readonly ObservationDefinition[];
}

@Injectable()
export class TerminologyService {
  getVitalSigns(): readonly ObservationDefinition[] {
    return VITAL_SIGNS;
  }

  getUnits(): readonly UnitDefinition[] {
    return UCUM_UNITS;
  }

  getObservationCatalogue(): ObservationCatalogueView {
    return {
      system: SAHATN_TERMINOLOGY_SYSTEM,
      version: TERMINOLOGY_VERSION,
      items: OBSERVATION_CATALOGUE
    };
  }
}
