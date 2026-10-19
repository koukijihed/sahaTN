import { Injectable } from '@nestjs/common';
import { DoctorSearchItemView, DoctorsService } from '../doctors/doctors.service';
import {
  FacilityListItemView,
  FacilitiesService
} from '../facilities/facilities.service';
import { SearchQueryDto } from './dto/search-query.dto';

// Recherche combinee publique. Les services `DoctorsService` et
// `FacilitiesService` sont reutilises tels quels : la regle de publication
// (verifie + publiquement lisible) reste unique et cote serveur.
@Injectable()
export class SearchService {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly facilitiesService: FacilitiesService
  ) {}

  async search(query: SearchQueryDto): Promise<{
    query: {
      type: string;
      q: string | undefined;
      governorate: string | undefined;
      sector: string | undefined;
      specialtyId: string | undefined;
      language: string | undefined;
    };
    doctors: {
      items: DoctorSearchItemView[];
      total: number;
      page: number;
      limit: number;
    } | null;
    facilities: {
      items: FacilityListItemView[];
      total: number;
      page: number;
      limit: number;
    } | null;
  }> {
    const type = query.type ?? 'all';
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const shared = {
      page,
      limit,
      q: query.q,
      governorate: query.governorate,
      sector: query.sector,
      specialtyId: query.specialtyId
    };

    const [doctors, facilities] = await Promise.all([
      type === 'facilities'
        ? Promise.resolve(null)
        : this.doctorsService.searchPublic({ ...shared, language: query.language }),
      type === 'doctors'
        ? Promise.resolve(null)
        : this.facilitiesService.listPublic(shared)
    ]);

    return {
      query: {
        type,
        q: query.q,
        governorate: query.governorate,
        sector: query.sector,
        specialtyId: query.specialtyId,
        language: query.language
      },
      doctors,
      facilities
    };
  }
}