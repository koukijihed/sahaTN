// Utilitaires de temps pour les agendas. Les creneaux sont stockes en UTC ;
// les equipes saisissent des heures locales dans le fuseau de l'agenda
// (defaut : Africa/Tunis).
//
// La conversion « heure de paroi locale -> instant UTC » utilise
// Intl.DateTimeFormat : une seule correction suffit hors des transitions DST
// ambigues (inexistantes a ce jour en Tunisie).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTE_MS = 60_000;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTimeString(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    return false;
  }
  try {
    // Lève une RangeError si le fuseau est inconnu d'Intl.
    void new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function partsInTimeZone(
  instant: number,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date(instant));

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = parseInt(part.value, 10);
    }
  }
  // Certains environnements rendent minuit comme "24" en heure12:false.
  const hour = map.hour === 24 ? 0 : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second ?? 0
  };
}

/** Convertit une heure de paroi « date + HH:MM » (fuseau timeZone) en instant UTC. */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const wall = partsInTimeZone(target, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  return new Date(target - (wallAsUtc - target));
}

/** Bornes [début de jour, début du jour suivant) d'une date dans le fuseau donné. */
export function zonedDateRange(
  date: string,
  timeZone: string
): { from: Date; to: Date } {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextIso = next.toISOString().slice(0, 10);
  return {
    from: zonedDateTimeToUtc(date, '00:00', timeZone),
    to: zonedDateTimeToUtc(nextIso, '00:00', timeZone)
  };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}