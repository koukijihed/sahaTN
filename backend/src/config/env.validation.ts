import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test'
}

// Conversion explicite et stricte d'une variable d'environnement entiere.
//
// Les variables d'environnement arrivent toujours sous forme de chaines. On
// accepte uniquement un litteral entier (chiffres, signe optionnel, espaces
// autour ignores). Toute autre valeur (chaine vide, texte, decimale,
// exponentielle, "Infinity", "NaN", nombre hors plage entiere sure) est
// conservee telle quelle afin que les validateurs class-validator (`@IsInt`,
// `@Min`, `@Max`) la rejettent explicitement. On ne remplace jamais une entree
// invalide par la valeur par defaut : le demarrage doit echouer.
function toInteger({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return value;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

// Conversion explicite d'un booleen d'environnement. On accepte uniquement
// les litteraux usuels (`true`/`false`, `1`/`0`, insensible a la casse) ainsi
// que les vrais booleens. Toute autre valeur est conservee telle quelle afin
// que `@IsBoolean` la rejette : on n'interprete jamais silencieusement une
// valeur ambigue (ex. "yes", "on", "peut-etre").
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return value;
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 4000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  API_PREFIX = 'api';

  // Exposition de la documentation OpenAPI (Swagger). Absent : la valeur par
  // defaut depend de l'environnement (voir `resolveApiDocsEnabled`) afin de ne
  // JAMAIS exposer la documentation publiquement en production sans choix
  // explicite. Toute valeur non booleenne est rejetee au demarrage.
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  ENABLE_API_DOCS?: boolean;

  @IsString()
  @IsOptional()
  DATABASE_URL = 'postgresql://sahatn:sahatn@localhost:5432/sahatn';

  @IsString()
  @IsOptional()
  SESSION_COOKIE_NAME = 'sahatn_session';

  @IsString()
  @IsOptional()
  CSRF_COOKIE_NAME = 'sahatn_csrf';

  @Transform(toInteger)
  @IsInt()
  @Min(60)
  @IsOptional()
  SESSION_TTL_SECONDS = 604800;

  @IsString()
  @IsOptional()
  COOKIE_DOMAIN = '';

  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  LOGIN_MAX_ATTEMPTS = 5;

  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @IsOptional()
  LOGIN_LOCK_MINUTES = 15;

  // Repertoire prive de stockage des documents medicaux (hors repertoire public).
  @IsString()
  @IsOptional()
  DOCUMENT_STORAGE_DIR = '';

  // Taille maximale d'un document medical, en octets. Bornee pour proteger la
  // memoire du processus (upload en memoire) et reste configurable.
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(26214400)
  @IsOptional()
  DOCUMENT_MAX_FILE_BYTES = 5242880;
}

export function validateEnv(
  config: Record<string, unknown>
): EnvironmentVariables {
  // Note : on n'active PAS `enableImplicitConversion`, qui convertirait
  // globalement tous les types (y compris les chaines booleennes) et ne
  // s'applique de toute facon pas aux proprietes portant une valeur par
  // defaut. La conversion des entiers est faite explicitement via `toInteger`.
  const validated = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.toString()}`
    );
  }

  return validated;
}

// Determine si la documentation OpenAPI doit etre exposee. Regle sure par
// defaut : la documentation est disponible hors production et DESACTIVEE en
// production, sauf activation explicite via `ENABLE_API_DOCS=true`.
export function resolveApiDocsEnabled(
  rawValue: string | undefined,
  nodeEnv: string
): boolean {
  if (rawValue === undefined || rawValue.trim() === '') {
    return nodeEnv !== 'production';
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}
