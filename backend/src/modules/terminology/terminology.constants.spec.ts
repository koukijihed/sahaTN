import { ClinicalObservationCategory } from '@prisma/client';
import {
  isKnownUnit,
  isKnownVitalSignCode,
  OBSERVATION_CATALOGUE,
  SAHATN_TERMINOLOGY_SYSTEM,
  UCUM_UNITS,
  VITAL_SIGNS
} from './terminology.constants';
import { TerminologyService } from './terminology.service';

const ARABIC = /[\u0600-\u06FF]/;

describe('terminology constants (integrite du referentiel interne)', () => {
  it('exposes a well-formed internal namespace', () => {
    expect(SAHATN_TERMINOLOGY_SYSTEM).toMatch(/^https:\/\//);
  });

  it('catalogues at least one observation', () => {
    expect(OBSERVATION_CATALOGUE.length).toBeGreaterThan(0);
  });

  it('uses unique codes', () => {
    const codes = OBSERVATION_CATALOGUE.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('codes follow the internal naming pattern', () => {
    for (const entry of OBSERVATION_CATALOGUE) {
      expect(entry.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('every entry carries bilingual non-empty labels', () => {
    for (const entry of OBSERVATION_CATALOGUE) {
      expect(entry.labelFr.trim().length).toBeGreaterThan(0);
      expect(entry.labelAr.trim().length).toBeGreaterThan(0);
      expect(entry.labelAr).toMatch(ARABIC);
    }
  });

  it('every entry uses a unit from the UCUM subset', () => {
    for (const entry of OBSERVATION_CATALOGUE) {
      expect(isKnownUnit(entry.unit)).toBe(true);
    }
  });

  it('every entry uses a known observation category', () => {
    const categories = Object.values(ClinicalObservationCategory);
    for (const entry of OBSERVATION_CATALOGUE) {
      expect(categories).toContain(entry.category);
    }
  });

  it('marks vital signs with the VITAL_SIGN category', () => {
    for (const entry of VITAL_SIGNS) {
      expect(entry.category).toBe(ClinicalObservationCategory.VITAL_SIGN);
    }
  });

  it('UCUM units have unique codes and bilingual labels', () => {
    const codes = UCUM_UNITS.map((unit) => unit.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const unit of UCUM_UNITS) {
      expect(unit.labelFr.trim().length).toBeGreaterThan(0);
      expect(unit.labelAr).toMatch(ARABIC);
    }
  });

  it('resolves known codes and units, rejects unknown ones', () => {
    expect(isKnownVitalSignCode('VITAL_HEART_RATE')).toBe(true);
    expect(isKnownVitalSignCode('UNKNOWN_CODE')).toBe(false);
    expect(isKnownUnit('mm[Hg]')).toBe(true);
    expect(isKnownUnit('mmHg')).toBe(false);
  });
});

describe('TerminologyService', () => {
  const service = new TerminologyService();

  it('returns the observation catalogue with namespace and version', () => {
    const catalogue = service.getObservationCatalogue();
    expect(catalogue.system).toBe(SAHATN_TERMINOLOGY_SYSTEM);
    expect(catalogue.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(catalogue.items).toEqual(OBSERVATION_CATALOGUE);
  });

  it('returns the same items as the vital-signs listing', () => {
    expect(service.getVitalSigns()).toEqual(VITAL_SIGNS);
  });
});
