import * as chrono from 'chrono-node';
import { ParsedVoiceEvent } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Resolución de fecha — casos que chrono.es no maneja correctamente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta expresiones de fecha que chrono.es parsea mal o no parsea:
 *   - "pasado mañana" → solo captura "mañana", pierde el +1 extra
 *   - "el N de este mes" → frecuentemente no detectado
 *
 * Retorna la fecha correcta o null si no aplica.
 */
function getDateOverride(text: string, referenceDate: Date): Date | null {
  // "pasado mañana" = day after tomorrow
  if (/\bpasado\s+ma[ñn]ana\b/i.test(text)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 2);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // "el N de este mes"
  const thisMonthMatch = text.match(/\bel\s+(\d{1,2})\s+de\s+este\s+mes\b/i);
  if (thisMonthMatch) {
    const d = new Date(referenceDate);
    d.setDate(parseInt(thisMonthMatch[1], 10));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolución de hora — basada en el texto del span, NO en chrono.meridiem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte una hora cruda a formato 24h usando el TEXTO del span de chrono.
 *
 * Por qué no usar chrono.get('meridiem') + isCertain:
 *   - Para "de 3 a 4 de la tarde", chrono marca start con meridiem=AM+certain,
 *     porque "de la tarde" va al final y no se propaga hacia atrás.
 *   - isCertain('meridiem') puede ser true con valor incorrecto.
 *
 * Estrategia:
 *   1. Si el texto del span tiene "de la tarde/noche" → PM
 *   2. Si tiene "de la mañana/madrugada" → AM
 *   3. Sino → heurística: 1-7 = PM, 8-12 = AM
 *
 * Retorna -1 si hour es null.
 *
 * @param hour       - valor de get('hour') del componente chrono
 * @param timeWindow - fragmento del texto original que cubre el span + "de la tarde" si hay
 */
function resolveHour(hour: number | null | undefined, timeWindow: string): number {
  if (hour == null) return -1;

  const hasNoche = /de la noche/i.test(timeWindow);
  const hasTarde = /de la tarde/i.test(timeWindow);
  const hasMana = /de la (?:mañana|madrugada)/i.test(timeWindow);

  if (hasNoche && !hasMana) return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;  // "12 de la noche" = 00:00
  if (hasTarde && !hasMana && !hasNoche) return hour < 12 ? hour + 12 : hour;       // PM explícito
  if (hasMana && !hasTarde && !hasNoche) return hour === 12 ? 0 : hour;             // AM explícito
  // Heurística sin qualifier
  return hour >= 1 && hour <= 7 ? hour + 12 : hour;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de hora de fin desde el texto del span
// ─────────────────────────────────────────────────────────────────────────────

/**
 * chrono.es parsea "de 3 a 4 de la tarde" como resultados separados ("de 3 a", "tarde"),
 * nunca como un rango con result.end. Extraemos el fin directamente del timeWindow.
 *
 * Retorna el número crudo (ej: 4, 12, 11) o null si no hay patrón "de X a Y".
 */
function extractEndHour(timeWindow: string): { hour: number; minute: number } | null {
  const m = timeWindow.match(
    /de\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+a\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?/i,
  );
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: m[2] ? parseInt(m[2], 10) : 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de título
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patrones de TIEMPO. chrono.es puede capturar "de 3 a" sin "4 de la tarde",
 * o "6" sin "de la tarde". Se marcan por regex sobre el texto ORIGINAL.
 */
const TIME_PATTERNS: RegExp[] = [
  // "de 3 a 4 de la tarde", "de 9am a 11am", "de 10 a 12"
  /de\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+a\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+de la (?:tarde|mañana|noche|madrugada))?/gi,
  // "a las 6 de la tarde", "a la 1", "a las 2"
  /a\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+de la (?:tarde|mañana|noche|madrugada))?/gi,
  // calificadores de meridiem huérfanos
  /\bde la (?:tarde|mañana|noche|madrugada)\b/gi,
];

/**
 * Prefijos de fecha que chrono.es NO incluye en su span:
 *   - "el viernes" → span text="viernes" (sin "el")
 *   - "pasado mañana" → span text="mañana" (sin "pasado")
 *   - "el 20 de este mes" → a veces no capturado del todo
 */
const DATE_PREFIX_PATTERNS: RegExp[] = [
  // "pasado mañana"
  /\bpasado\s+ma[ñn]ana\b/gi,
  // "el [próximo] weekday [day de month]"
  /\bel\s+(?:pr[oó]ximo\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+\d{1,2}(?:\s+de\s+\w+)?)?\b/gi,
  // "el day de [este mes | month]"
  /\bel\s+\d{1,2}\s+de\s+(?:este\s+mes|\w+)\b/gi,
];

const CONNECTOR_PATTERNS: RegExp[] = [
  /\btengo que ir\b/gi,
  /\bvoy a ir\b/gi,
  /\btengo que\b/gi,
  /\btengo\b/gi,
  /\bhay\b/gi,
  /\bvoy a\b/gi,
];

/**
 * Elimina referencias temporales con un bitmask de caracteres.
 *
 * Por qué bitmask: chrono puede entregar spans parciales ("de 3 a" sin "4 de la tarde").
 * Con el bitmask, regex y spans operan sobre el MISMO texto original sin desplazamientos.
 */
function extractTitle(text: string, matches: chrono.ParsedResult[]): string {
  const toRemove = new Array<boolean>(text.length).fill(false);

  const markPattern = (pattern: RegExp): void => {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      for (let i = m.index; i < m.index + m[0].length; i++) toRemove[i] = true;
    }
  };

  for (const p of DATE_PREFIX_PATTERNS) markPattern(p);
  for (const p of TIME_PATTERNS) markPattern(p);
  for (const result of matches) {
    for (let i = result.index; i < result.index + result.text.length; i++) {
      if (i < toRemove.length) toRemove[i] = true;
    }
  }

  let result = text.split('').filter((_, i) => !toRemove[i]).join('');
  for (const p of CONNECTOR_PATTERNS) result = result.replace(p, ' ');

  result = result.replace(/\s+/g, ' ').trim();
  if (!result) return 'Evento sin título';
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Confianza
// ─────────────────────────────────────────────────────────────────────────────

function computeConfidence(hasTime: boolean, hasEndTime: boolean): number {
  if (hasTime && hasEndTime) return 0.95;
  if (hasTime) return 0.80;
  return 0.50;
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

function toLocalISO(baseDate: Date, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}` +
    `T${pad(hour)}:${pad(minute)}:00`
  );
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parsea texto en español y extrae un evento estructurado.
 *
 * @param text          - Texto libre. Ej: "mañana tengo dentista de 3 a 4 de la tarde"
 * @param referenceDate - Fecha de referencia para expresiones relativas (default: ahora)
 */
export function parseVoiceInput(
  text: string,
  referenceDate: Date = new Date(),
): ParsedVoiceEvent {
  const results = chrono.es.parse(text, referenceDate, { forwardDate: true });

  if (results.length === 0) {
    return {
      title: extractTitle(text, []),
      date: formatDate(referenceDate),
      startTime: toLocalISO(referenceDate, referenceDate.getHours(), referenceDate.getMinutes()),
      endTime: toLocalISO(referenceDate, referenceDate.getHours() + 1, referenceDate.getMinutes()),
      confidence: 0.10,
      rawText: text,
    };
  }

  // Fecha: override si chrono no la parseó bien, o la del primer resultado
  const dateOverride = getDateOverride(text, referenceDate);
  const baseDate: Date = (() => {
    if (dateOverride) return dateOverride;
    const d = new Date(results[0].start.date());
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // Resultado con hora EXPLÍCITA (isCertain=true → vino del texto, no heredada del ref)
  const timeResult = results.find(r => r.start.isCertain('hour')) ?? null;

  let startHour = 9;
  let startMinute = 0;
  let hasStartTime = false;

  if (timeResult != null) {
    // Ventana de texto: el span + un buffer para capturar "de la tarde" al final
    const windowEnd = Math.min(text.length, timeResult.index + timeResult.text.length + 30);
    const timeWindow = text.slice(timeResult.index, windowEnd);

    const rawStart = resolveHour(timeResult.start.get('hour'), timeWindow);
    if (rawStart >= 0) {
      startHour = rawStart;
      startMinute = timeResult.start.get('minute') ?? 0;
      hasStartTime = true;
    }

    // Fin del rango: chrono.es NO genera result.end para "de X a Y" (bug de la librería).
    // Extraemos el fin con regex sobre el timeWindow; si no hay, fallback a chrono o startHour+1.
    let hasEndTime = false;
    let endHour = startHour + 1;
    let endMinute = startMinute;

    const rawEndFromText = extractEndHour(timeWindow);
    if (rawEndFromText != null) {
      const resolved = resolveHour(rawEndFromText.hour, timeWindow);
      if (resolved >= 0) {
        endHour = resolved;
        endMinute = rawEndFromText.minute;
        hasEndTime = true;
      }
    } else if (timeResult.end != null && timeResult.end.get('hour') != null) {
      const rawEnd = resolveHour(timeResult.end.get('hour'), timeWindow);
      if (rawEnd >= 0) {
        endHour = rawEnd;
        endMinute = timeResult.end.get('minute') ?? 0;
        hasEndTime = true;
      }
    }

    return {
      title: extractTitle(text, results),
      date: formatDate(baseDate),
      startTime: toLocalISO(baseDate, startHour, startMinute),
      endTime: toLocalISO(baseDate, endHour, endMinute),
      confidence: computeConfidence(hasStartTime, hasEndTime),
      rawText: text,
    };
  }

  // Sin hora explícita: solo tenemos fecha
  return {
    title: extractTitle(text, results),
    date: formatDate(baseDate),
    startTime: toLocalISO(baseDate, 9, 0),
    endTime: toLocalISO(baseDate, 10, 0),
    confidence: computeConfidence(false, false),
    rawText: text,
  };
}
