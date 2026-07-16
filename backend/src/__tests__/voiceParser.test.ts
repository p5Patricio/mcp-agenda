import { parseVoiceInput } from '../services/voiceParser';

/**
 * Fecha de referencia fija: lunes 16 de marzo de 2026, mediodía hora local.
 * Lunes → "el viernes" = 20/03, "mañana" = 17/03, "pasado mañana" = 18/03.
 */
const REF = new Date(2026, 2, 16, 12, 0, 0);

/** Extrae la hora (0-23) de un string ISO local "YYYY-MM-DDTHH:mm:ss" */
function hour(iso: string): number {
  return parseInt(iso.split('T')[1].split(':')[0], 10);
}

/** Extrae los minutos de un string ISO local */
function minute(iso: string): number {
  return parseInt(iso.split('T')[1].split(':')[1], 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// CASOS PRINCIPALES
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — casos principales', () => {
  test('dentista de 3 a 4 de la tarde → 15:00-16:00, título "Dentista"', () => {
    const r = parseVoiceInput('mañana tengo dentista de 3 a 4 de la tarde', REF);

    expect(r.title).toBe('Dentista');
    expect(r.date).toBe('2026-03-17');
    expect(hour(r.startTime)).toBe(15);
    expect(hour(r.endTime)).toBe(16);
    expect(minute(r.startTime)).toBe(0);
    expect(minute(r.endTime)).toBe(0);
    expect(r.confidence).toBeGreaterThanOrEqual(0.90);
    expect(r.rawText).toBe('mañana tengo dentista de 3 a 4 de la tarde');
  });

  test('reunión de 10 a 12 → AM, próximo viernes', () => {
    const r = parseVoiceInput('el viernes reunión con el equipo de 10 a 12', REF);

    expect(r.title).toBe('Reunión con el equipo');
    expect(r.date).toBe('2026-03-20');
    expect(hour(r.startTime)).toBe(10);
    expect(hour(r.endTime)).toBe(12);
    expect(r.confidence).toBeGreaterThanOrEqual(0.90);
  });

  test('a las 6 de la tarde, sin hora de fin → asume +1h', () => {
    const r = parseVoiceInput('hoy a las 6 de la tarde ir al gym', REF);

    expect(r.title).toBe('Ir al gym');
    expect(r.date).toBe('2026-03-16');
    expect(hour(r.startTime)).toBe(18);
    expect(hour(r.endTime)).toBe(19);
    expect(r.confidence).toBeGreaterThanOrEqual(0.70);
  });

  test('9am a 11am con meridiem explícito', () => {
    const r = parseVoiceInput(
      'el lunes 14 de abril junta con clientes de 9am a 11am',
      REF,
    );

    expect(r.title).toBe('Junta con clientes');
    // 14 de abril 2026 es martes; chrono puede devolver lunes 13 o martes 14
    expect(r.date).toMatch(/^2026-04-1[34]/);
    expect(hour(r.startTime)).toBe(9);
    expect(hour(r.endTime)).toBe(11);
    expect(r.confidence).toBeGreaterThanOrEqual(0.90);
  });

  test('a las 2 sin AM/PM → heurística PM (14:00)', () => {
    const r = parseVoiceInput('pasado mañana comida con mamá a las 2', REF);

    expect(r.title).toBe('Comida con mamá');
    expect(r.date).toBe('2026-03-18');
    expect(hour(r.startTime)).toBe(14);
    expect(hour(r.endTime)).toBe(15);
    expect(r.confidence).toBeGreaterThanOrEqual(0.70);
  });

  test('de 4 a 6 de la tarde → 16:00-18:00', () => {
    const r = parseVoiceInput(
      'el 20 de este mes presentación del proyecto de 4 a 6 de la tarde',
      REF,
    );

    expect(r.title).toBe('Presentación del proyecto');
    expect(r.date).toBe('2026-03-20');
    expect(hour(r.startTime)).toBe(16);
    expect(hour(r.endTime)).toBe(18);
    expect(r.confidence).toBeGreaterThanOrEqual(0.90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HEURÍSTICA AM/PM
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — heurística AM/PM', () => {
  test('hora 1-7 sin qualificador → asume PM', () => {
    const r = parseVoiceInput('mañana reunión a las 3', REF);
    expect(hour(r.startTime)).toBe(15);
  });

  test('hora 8-12 sin qualificador → asume AM', () => {
    const r = parseVoiceInput('mañana reunión a las 10', REF);
    expect(hour(r.startTime)).toBe(10);
  });

  test('"de la mañana" → AM explícito', () => {
    const r = parseVoiceInput('mañana reunión a las 9 de la mañana', REF);
    expect(hour(r.startTime)).toBe(9);
  });

  test('"de la tarde" con hora 6 → 18', () => {
    const r = parseVoiceInput('mañana reunión a las 6 de la tarde', REF);
    expect(hour(r.startTime)).toBe(18);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASOS EDGE
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — casos edge', () => {
  test('sin referencias temporales → confidence bajo + título preservado', () => {
    const r = parseVoiceInput('reunión importante', REF);
    expect(r.confidence).toBeLessThan(0.50);
    expect(r.title).toBe('Reunión importante');
  });

  test('texto vacío → "Evento sin título"', () => {
    const r = parseVoiceInput('', REF);
    expect(r.title).toBe('Evento sin título');
  });

  test('rawText siempre preserva el texto original intacto', () => {
    const text = 'mañana reunión a las 3';
    const r = parseVoiceInput(text, REF);
    expect(r.rawText).toBe(text);
  });

  test('sin hora de fin → endTime = startTime + 1h', () => {
    const r = parseVoiceInput('mañana comida a las 2 de la tarde', REF);
    expect(hour(r.startTime)).toBe(14);
    expect(hour(r.endTime)).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-003: "mañana" disambiguation (Bug #2)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — mañana disambiguation (Bug #2)', () => {
  // refDate = Wednesday 2026-07-15
  const REF_WED = new Date(2026, 6, 15, 12, 0, 0);

  test('"cita el martes por la mañana" → date = Tuesday 2026-07-14 (weekday, NOT tomorrow)', () => {
    const r = parseVoiceInput('cita el martes por la mañana', REF_WED);
    expect(r.date).toBe('2026-07-14');
    expect(r.title).toBe('Cita');
  });

  test('standalone "mañana tengo dentista" → date = 2026-07-16 (tomorrow)', () => {
    const r = parseVoiceInput('mañana tengo dentista', REF_WED);
    expect(r.date).toBe('2026-07-16');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-004: Date expressions (Bug #4)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — date expressions (Bug #4)', () => {
  // refDate = Wednesday 2026-07-15
  const REF_WED = new Date(2026, 6, 15, 12, 0, 0);

  test('"reunión la próxima semana" → next Monday 2026-07-20', () => {
    const r = parseVoiceInput('reunión la próxima semana', REF_WED);
    expect(r.date).toBe('2026-07-20');
  });

  test('"cita dentro de 3 días" → 2026-07-18', () => {
    const r = parseVoiceInput('cita dentro de 3 días', REF_WED);
    expect(r.date).toBe('2026-07-18');
  });

  test('"cita en una semana" → 2026-07-22', () => {
    const r = parseVoiceInput('cita en una semana', REF_WED);
    expect(r.date).toBe('2026-07-22');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-005: Time range preserves both start and end minutes (Bug #5)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — time range minutes (Bug #5)', () => {
  test('"de 3:30 a 4:45 de la tarde" → startTime=15:30, endTime=16:45', () => {
    const r = parseVoiceInput('cita de 3:30 a 4:45 de la tarde', REF);
    expect(hour(r.startTime)).toBe(15);
    expect(minute(r.startTime)).toBe(30);
    expect(hour(r.endTime)).toBe(16);
    expect(minute(r.endTime)).toBe(45);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-006: Title cleanup — date phrases stripped (Bug #9)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVoiceInput — title cleanup (Bug #9)', () => {
  test('"reunión de equipo el martes por la mañana" → title = "Reunión de equipo"', () => {
    const REF_WED = new Date(2026, 6, 15, 12, 0, 0);
    const r = parseVoiceInput('reunión de equipo el martes por la mañana', REF_WED);
    expect(r.title).toBe('Reunión de equipo');
  });
});
