/**
 * Hilfsfunktionen rund um Belastungsvorgaben (Prescription):
 * Lesen/Schreiben einzelner Variablen, Vergleich, Volumen und Formatierung.
 */
import type { ExerciseDefinition, Prescription, ProgressionStep, ProgressionVariable } from '../domain/types';

type NumericField = 'sets' | 'reps' | 'durationSec' | 'holdSec' | 'weightKg' | 'resistance' | 'speedKmh' | 'inclinePct' | 'contacts' | 'intensityPct' | 'level';
type CategoricalField = 'rom' | 'tempo' | 'surface';

export const VARIABLE_FIELD: Record<ProgressionVariable, NumericField | CategoricalField> = {
  reps: 'reps',
  sets: 'sets',
  duration: 'durationSec',
  hold: 'holdSec',
  weight: 'weightKg',
  resistance: 'resistance',
  rom: 'rom',
  tempo: 'tempo',
  speed: 'speedKmh',
  incline: 'inclinePct',
  surface: 'surface',
  difficulty: 'level',
  singleLeg: 'level',
  explosiveness: 'intensityPct',
  contacts: 'contacts'
};

export const VARIABLE_LABEL: Record<ProgressionVariable, string> = {
  reps: 'Wiederholungszahl',
  sets: 'Satzanzahl',
  duration: 'Dauer',
  hold: 'Haltezeit',
  weight: 'Gewicht',
  resistance: 'Widerstand',
  rom: 'Bewegungsumfang',
  tempo: 'Tempo',
  speed: 'Geschwindigkeit',
  incline: 'Steigung',
  surface: 'Untergrund',
  difficulty: 'Schwierigkeit',
  singleLeg: 'Einbeinige Ausführung',
  explosiveness: 'Intensität',
  contacts: 'Bodenkontakte'
};

/** Felder, bei denen ein fehlender Wert als 0 gilt (Zusatzlast kann neu hinzukommen). */
const ZERO_DEFAULT = new Set<string>(['weightKg', 'resistance', 'inclinePct']);
const ONE_DEFAULT = new Set<string>(['level']);

export function getValue(p: Prescription, v: ProgressionVariable): number | string | undefined {
  const f = VARIABLE_FIELD[v];
  const val = (p as Record<string, unknown>)[f] as number | string | undefined;
  if (val === undefined && ZERO_DEFAULT.has(f)) return 0;
  if (val === undefined && ONE_DEFAULT.has(f)) return 1;
  return val;
}

export function setValue(p: Prescription, v: ProgressionVariable, value: number | string): Prescription {
  const f = VARIABLE_FIELD[v];
  return { ...p, [f]: value };
}

function roundTo(n: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

/**
 * Nächster Wert einer Progressionsstufe.
 * @param factor 0.5 = konservativer halber Schritt
 * @returns undefined, wenn diese Variable ausgeschöpft bzw. nicht anwendbar ist
 */
export function nextValue(p: Prescription, step: ProgressionStep, factor = 1): number | string | undefined {
  const cur = getValue(p, step.variable);
  if (step.sequence) {
    const idx = step.sequence.indexOf(String(cur ?? step.sequence[0]));
    if (idx < 0) return step.sequence[0] !== cur ? step.sequence[0] : undefined;
    return idx + 1 < step.sequence.length ? step.sequence[idx + 1] : undefined;
  }
  if (typeof cur !== 'number') return undefined;
  if (step.values) {
    const next = step.values.find((x) => x > cur);
    if (next === undefined) return undefined;
    if (factor < 1) {
      // konservativ: halber Abstand, mindestens +1 (bei ganzzahligen Werten)
      const half = cur + Math.max(1, Math.round((next - cur) * factor));
      return Math.min(half, next);
    }
    return next;
  }
  if (step.step === undefined) return undefined;
  const max = step.max ?? Infinity;
  if (cur >= max) return undefined;
  const integer = ['sets', 'reps', 'contacts', 'level'].includes(VARIABLE_FIELD[step.variable]);
  let inc = step.step * factor;
  if (integer) inc = Math.max(1, Math.round(inc));
  return roundTo(Math.min(cur + inc, max));
}

/** Vorheriger Wert (für Regressionen) – nie unter den Ausgangswert der Übung. */
export function previousValue(p: Prescription, step: ProgressionStep, base: Prescription): number | string | undefined {
  const cur = getValue(p, step.variable);
  const baseVal = getValue(base, step.variable);
  if (cur === undefined || cur === baseVal) return undefined;
  if (step.sequence) {
    const idx = step.sequence.indexOf(String(cur));
    const baseIdx = step.sequence.indexOf(String(baseVal ?? step.sequence[0]));
    if (idx <= Math.max(0, baseIdx)) return undefined;
    return step.sequence[idx - 1];
  }
  if (typeof cur !== 'number') return undefined;
  const floor = typeof baseVal === 'number' ? baseVal : 0;
  if (cur <= floor) return undefined;
  if (step.values) {
    const prev = [...step.values].reverse().find((x) => x < cur);
    return Math.max(prev ?? floor, floor);
  }
  if (step.step === undefined) return undefined;
  return roundTo(Math.max(cur - step.step, floor));
}

/** Regressionsschritt(e): reduziert die zuletzt gesteigerte Variable (umgekehrte Pfadreihenfolge). */
export function regressPrescription(def: ExerciseDefinition, current: Prescription, steps = 1): { to: Prescription; variable?: ProgressionVariable } {
  let p = { ...current };
  let changed: ProgressionVariable | undefined;
  for (let i = 0; i < steps; i++) {
    let done = false;
    for (const st of [...def.progression].reverse()) {
      const prev = previousValue(p, st, def.defaultPrescription);
      if (prev !== undefined) {
        p = setValue(p, st.variable, prev);
        changed = changed ?? st.variable;
        done = true;
        break;
      }
    }
    if (!done) {
      // Bereits am Ausgangswert: Volumen über Sätze reduzieren, falls möglich
      if ((p.sets ?? 0) > 2) {
        p = { ...p, sets: (p.sets ?? 0) - 1 };
        changed = changed ?? 'sets';
      } else if ((p.durationSec ?? 0) > 300 && def.loadProfile !== 'running') {
        p = { ...p, durationSec: Math.round(((p.durationSec ?? 0) * 0.8) / 60) * 60 };
        changed = changed ?? 'duration';
      }
      break;
    }
  }
  return { to: p, variable: changed };
}

export function prescriptionEquals(a: Prescription, b: Prescription): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'restSec') continue;
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

/** Einfache Volumenkennzahl zum Vergleich geplant vs. tatsächlich. */
export function workVolume(p: Prescription): number {
  if (p.runSec !== undefined && p.rounds !== undefined) return p.runSec * p.rounds;
  const sets = p.sets ?? 1;
  if (p.contacts !== undefined) return sets * p.contacts;
  if (p.holdSec !== undefined && (p.reps ?? 1) >= 1 && p.durationSec === undefined) return sets * (p.reps ?? 1) * p.holdSec;
  if (p.reps !== undefined) return sets * p.reps;
  if (p.durationSec !== undefined) return sets * p.durationSec;
  return sets;
}

/** Erfüllungsquote tatsächliche/geplante Leistung (gekappt auf 1). */
export function completionRatio(planned: Prescription, actual: Prescription): number {
  const pv = workVolume(planned);
  if (pv <= 0) return 1;
  return Math.min(1, workVolume(actual) / pv);
}

/** Erfüllt eine Vorgabe die Mindestanforderungen? */
export function meetsMinimum(p: Prescription, min: { minSets?: number; minReps?: number; minDurationSec?: number; minHoldSec?: number }): boolean {
  if (min.minSets !== undefined && (p.sets ?? 1) < min.minSets) return false;
  if (min.minReps !== undefined && (p.reps ?? 0) < min.minReps) return false;
  if (min.minDurationSec !== undefined && (p.durationSec ?? 0) < min.minDurationSec) return false;
  if (min.minHoldSec !== undefined && (p.holdSec ?? 0) < min.minHoldSec) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}

const TEMPO_LABEL: Record<string, string> = { normal: 'normales Tempo', slow: 'langsames Tempo', eccentric: 'betont exzentrisch' };
const ROM_LABEL: Record<string, string> = { partial: 'Teilbewegung', full: 'voller Bewegungsumfang', deficit: 'erweiterter Bewegungsumfang' };
const SURFACE_LABEL: Record<string, string> = { flat: 'ebener Untergrund', mixed: 'gemischter Untergrund', uneven: 'unebener Untergrund' };

/** Kompakte Hauptangabe, z. B. „3 × 12“, „15 min“, „8 × 30 s Joggen / 90 s Gehen“. */
export function formatMain(p: Prescription): string {
  if (p.runSec !== undefined && p.walkSec !== undefined) {
    return `${p.rounds ?? 1} × ${formatDuration(p.runSec)} Joggen / ${formatDuration(p.walkSec)} Gehen`;
  }
  if (p.contacts !== undefined) return `${p.sets ?? 1} × ${p.contacts} Kontakte`;
  if (p.reps !== undefined && p.holdSec !== undefined && p.reps > 1) return `${p.sets ?? 1} × ${p.reps} (${p.holdSec} s halten)`;
  if (p.holdSec !== undefined) return `${p.sets ?? 1} × ${p.holdSec} s halten`;
  if (p.reps !== undefined) return `${p.sets ?? 1} × ${p.reps}`;
  if (p.durationSec !== undefined) return p.sets && p.sets > 1 ? `${p.sets} × ${formatDuration(p.durationSec)}` : formatDuration(p.durationSec);
  return '–';
}

/** Zusatzangaben wie Gewicht, Widerstand, Tempo. */
export function formatDetails(p: Prescription): string[] {
  const out: string[] = [];
  if (p.weightKg) out.push(`${p.weightKg.toLocaleString("de-DE")} kg`);
  if (p.resistance) out.push(`Widerstand ${p.resistance}`);
  if (p.speedKmh) out.push(`${p.speedKmh.toLocaleString('de-DE')} km/h`);
  if (p.inclinePct) out.push(`${p.inclinePct} % Steigung`);
  if (p.surface && p.surface !== 'flat') out.push(SURFACE_LABEL[p.surface]);
  if (p.tempo && p.tempo !== 'normal') out.push(TEMPO_LABEL[p.tempo]);
  if (p.rom) out.push(ROM_LABEL[p.rom]);
  if (p.level && p.level > 1) out.push(`Stufe ${p.level}`);
  if (p.intensityPct) out.push(`${p.intensityPct} % Intensität`);
  if (p.distanceM) out.push(`${p.distanceM} m`);
  if (p.stage) out.push(`Laufstufe ${p.stage}`);
  return out;
}

export function formatPrescription(p: Prescription): string {
  return [formatMain(p), ...formatDetails(p)].filter(Boolean).join(' · ');
}

/** Beschreibt den Wert einer einzelnen Variable (für Erklärungen). */
export function formatVariableValue(p: Prescription, v: ProgressionVariable): string {
  const val = getValue(p, v);
  switch (v) {
    case 'reps':
    case 'sets':
      return formatMain(p);
    case 'duration':
      return formatDuration(Number(val ?? 0));
    case 'hold':
      return `${val ?? 0} s`;
    case 'weight':
      return `${Number(val ?? 0).toLocaleString("de-DE")} kg`;
    case 'resistance':
      return `Stufe ${val ?? 0}`;
    case 'speed':
      return `${Number(val ?? 0).toLocaleString('de-DE')} km/h`;
    case 'incline':
      return `${val ?? 0} %`;
    case 'surface':
      return SURFACE_LABEL[String(val)] ?? String(val);
    case 'tempo':
      return TEMPO_LABEL[String(val)] ?? String(val);
    case 'rom':
      return ROM_LABEL[String(val)] ?? String(val);
    case 'explosiveness':
      return `${val ?? 0} %`;
    case 'contacts':
      return `${val ?? 0} Kontakte`;
    default:
      return String(val ?? '');
  }
}

/** Geschätzte Dauer in Minuten (für Zeitplanung). */
export function estimateMinutes(def: ExerciseDefinition, p: Prescription): number {
  if (p.runSec !== undefined && p.walkSec !== undefined) return Math.ceil(((p.runSec + p.walkSec) * (p.rounds ?? 1)) / 60) + 10;
  if (def.loadProfile === 'running') return Math.ceil((p.durationSec ?? 900) / 60) + 10;
  if (['walking', 'cycling', 'sport'].includes(def.loadProfile) && p.durationSec) return Math.ceil(p.durationSec / 60) + 2;
  const sets = p.sets ?? 1;
  const rest = p.restSec ?? 45;
  let work = 40;
  if (p.reps !== undefined) work = p.reps * (p.tempo === 'slow' || p.tempo === 'eccentric' ? 5 : 3) + (p.holdSec ?? 0) * p.reps;
  else if (p.holdSec !== undefined) work = p.holdSec;
  else if (p.durationSec !== undefined) work = p.durationSec;
  else if (p.contacts !== undefined) work = p.contacts * 1.5;
  const sides = def.singleLeg ? 1.3 : 1;
  return Math.max(2, Math.round(((sets * work + (sets - 1) * rest) * sides) / 60 + 0.5));
}
