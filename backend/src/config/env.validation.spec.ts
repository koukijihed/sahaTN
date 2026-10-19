import 'reflect-metadata';
import { resolveApiDocsEnabled, validateEnv } from './env.validation';

describe('validateEnv (environment configuration)', () => {
  describe('defaults', () => {
    it('applies legitimate defaults when nothing is provided', () => {
      const env = validateEnv({});
      expect(env.PORT).toBe(4000);
      expect(env.NODE_ENV).toBe('development');
      expect(env.SESSION_TTL_SECONDS).toBe(604800);
      expect(env.LOGIN_MAX_ATTEMPTS).toBe(5);
      expect(env.LOGIN_LOCK_MINUTES).toBe(15);
      expect(env.DOCUMENT_MAX_FILE_BYTES).toBe(5242880);
      expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
    });
  });

  describe('valid integer values', () => {
    it('accepts a numeric string for PORT (as provided by the OS / Docker)', () => {
      const env = validateEnv({ PORT: '4000' });
      expect(env.PORT).toBe(4000);
      expect(typeof env.PORT).toBe('number');
    });

    it('accepts digits with surrounding whitespace', () => {
      expect(validateEnv({ PORT: ' 8080 ' }).PORT).toBe(8080);
    });

    it('accepts an actual number', () => {
      expect(validateEnv({ PORT: 3000 }).PORT).toBe(3000);
    });

    it('accepts the boundary values of every integer variable', () => {
      expect(validateEnv({ PORT: '1' }).PORT).toBe(1);
      expect(validateEnv({ PORT: '65535' }).PORT).toBe(65535);
      expect(validateEnv({ SESSION_TTL_SECONDS: '60' }).SESSION_TTL_SECONDS).toBe(
        60
      );
      expect(validateEnv({ LOGIN_MAX_ATTEMPTS: '1' }).LOGIN_MAX_ATTEMPTS).toBe(
        1
      );
      expect(validateEnv({ LOGIN_MAX_ATTEMPTS: '100' }).LOGIN_MAX_ATTEMPTS).toBe(
        100
      );
      expect(validateEnv({ LOGIN_LOCK_MINUTES: '1' }).LOGIN_LOCK_MINUTES).toBe(
        1
      );
      expect(
        validateEnv({ DOCUMENT_MAX_FILE_BYTES: '26214400' })
          .DOCUMENT_MAX_FILE_BYTES
      ).toBe(26214400);
    });
  });

  describe('invalid integer values are rejected (never silently defaulted)', () => {
    const invalidPorts: Array<[string, unknown]> = [
      ['empty string', ''],
      ['whitespace only', '   '],
      ['non numeric text', 'abc'],
      ['decimal', '1.5'],
      ['exponential', '1e3'],
      ['hexadecimal', '0x10'],
      ['Infinity', 'Infinity'],
      ['-Infinity', '-Infinity'],
      ['NaN', 'NaN'],
      ['below minimum', '0'],
      ['above maximum', '65536'],
      ['negative', '-1'],
      ['out of safe integer range', '99999999999999999999'],
      ['boolean', true]
    ];

    it.each(invalidPorts)('rejects PORT=%s', (_label, value) => {
      expect(() => validateEnv({ PORT: value })).toThrow(
        /Invalid environment configuration/
      );
    });

    it('does not fall back to the default when PORT is invalid', () => {
      let result: unknown;
      try {
        result = validateEnv({ PORT: 'abc' });
      } catch {
        result = undefined;
      }
      expect(result).toBeUndefined();
    });

    it('rejects an invalid SESSION_TTL_SECONDS below the minimum', () => {
      expect(() => validateEnv({ SESSION_TTL_SECONDS: '59' })).toThrow();
    });

    it('rejects a LOGIN_MAX_ATTEMPTS above the maximum', () => {
      expect(() => validateEnv({ LOGIN_MAX_ATTEMPTS: '101' })).toThrow();
    });

    it('rejects a non-numeric LOGIN_LOCK_MINUTES', () => {
      expect(() => validateEnv({ LOGIN_LOCK_MINUTES: 'soon' })).toThrow();
    });

    it('rejects a DOCUMENT_MAX_FILE_BYTES above the maximum', () => {
      expect(() =>
        validateEnv({ DOCUMENT_MAX_FILE_BYTES: '26214401' })
      ).toThrow();
    });

    it('names the offending variable in the error message', () => {
      expect(() => validateEnv({ PORT: 'nope' })).toThrow(/PORT/);
    });
  });

  describe('non-integer variables are untouched', () => {
    it('keeps string and enum variables as provided', () => {
      const env = validateEnv({
        NODE_ENV: 'production',
        API_PREFIX: 'v1',
        CORS_ORIGIN: 'https://app.example.tn',
        COOKIE_DOMAIN: '.example.tn'
      });
      expect(env.NODE_ENV).toBe('production');
      expect(env.API_PREFIX).toBe('v1');
      expect(env.CORS_ORIGIN).toBe('https://app.example.tn');
      expect(env.COOKIE_DOMAIN).toBe('.example.tn');
    });

    it('does not coerce boolean-like strings into booleans', () => {
      const env = validateEnv({ NODE_ENV: 'test' });
      expect(env.NODE_ENV).toBe('test');
    });

    it('rejects an unknown NODE_ENV', () => {
      expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow();
    });
  });

  describe('ENABLE_API_DOCS (boolean)', () => {
    it('is undefined when not provided', () => {
      expect(validateEnv({}).ENABLE_API_DOCS).toBeUndefined();
    });

    it.each([
      ['true', 'true'],
      ['false', 'false'],
      ['1', '1'],
      ['0', '0'],
      ['TRUE', 'TRUE'],
      [' False ', ' False ']
    ])('accepts %s', (_label, value) => {
      expect(typeof validateEnv({ ENABLE_API_DOCS: value }).ENABLE_API_DOCS).toBe(
        'boolean'
      );
    });

    it('accepts a real boolean', () => {
      expect(validateEnv({ ENABLE_API_DOCS: true }).ENABLE_API_DOCS).toBe(true);
    });

    it('rejects ambiguous values instead of guessing', () => {
      expect(() => validateEnv({ ENABLE_API_DOCS: 'yes' })).toThrow(
        /Invalid environment configuration/
      );
    });

    it('names the offending variable in the error message', () => {
      expect(() => validateEnv({ ENABLE_API_DOCS: 'peut-etre' })).toThrow(
        /ENABLE_API_DOCS/
      );
    });
  });

  describe('resolveApiDocsEnabled (safe by default)', () => {
    it('enables docs outside production when unset', () => {
      expect(resolveApiDocsEnabled(undefined, 'development')).toBe(true);
      expect(resolveApiDocsEnabled(undefined, 'test')).toBe(true);
    });

    it('disables docs in production when unset', () => {
      expect(resolveApiDocsEnabled(undefined, 'production')).toBe(false);
    });

    it('respects an explicit value regardless of environment', () => {
      expect(resolveApiDocsEnabled('true', 'production')).toBe(true);
      expect(resolveApiDocsEnabled('false', 'development')).toBe(false);
      expect(resolveApiDocsEnabled('1', 'production')).toBe(true);
      expect(resolveApiDocsEnabled('0', 'development')).toBe(false);
    });

    it('treats an empty value as unset', () => {
      expect(resolveApiDocsEnabled('', 'production')).toBe(false);
      expect(resolveApiDocsEnabled('   ', 'development')).toBe(true);
    });
  });
});
