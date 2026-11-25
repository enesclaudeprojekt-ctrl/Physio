/**
 * Export / Import / Datensicherung – reine Funktionen (ohne Browser-APIs testbar).
 */
import type { TrainingSession } from '../domain/types';
import { CLEARANCE_KEYS } from '../domain/types';
import { DEFAULT_SETTINGS, type AppData } from './db';
import { ExerciseDatabase } from '../engine/exerciseDatabase';
import { formatPrescription } from '../engine/prescription';

export const EXPORT_FORMAT = 'rehakompass-backup';
export const EXPORT_VERSION = 1;

export interface ExportFile extends AppData {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
}

export function buildExport(data: AppData, now = new Date()): ExportFile {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), ...data };
}

export type ImportResult = { ok: true; data: AppData; summary: string } | { ok: false; errors: string[] };

const isArr = (x: unknown): x is unknown[] => Array.isArray(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isDate = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Die Datei ist kein gültiges JSON.'] };
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Unerwartetes Dateiformat.'] };
  if (raw.format !== EXPORT_FORMAT) errors.push('Die Datei ist keine RehaKompass-Sicherung.');
  if (typeof raw.version !== 'number' || raw.version > EXPORT_VERSION) errors.push('Nicht unterstützte Versionsnummer der Sicherung.');
  for (const k of ['sessions', 'followUps', 'tests', 'adjustments']) if (!isArr(raw[k])) errors.push(`Feld „${k}“ fehlt oder ist ungültig.`);
  if (raw.profile !== null && !isObj(raw.profile)) errors.push('Profil ist ungültig.');
  if (errors.length) return { ok: false, errors };

  const sessions = (raw.sessions as unknown[]).filter((s): s is TrainingSession => isObj(s) && typeof s.id === 'string' && isDate(s.date) && isArr(s.exercises));
  if (sessions.length !== (raw.sessions as unknown[]).length) errors.push(`${(raw.sessions as unknown[]).length - sessions.length} Trainingseinheit(en) sind beschädigt.`);
  for (const s of sessions) {
    for (const e of s.exercises) if (!ExerciseDatabase.get(e.exerciseId)) errors.push(`Unbekannte Übung „${e.exerciseId}“ in Einheit ${s.date}.`);
    s.warnings = s.warnings ?? [];
  }
  const profile = raw.profile as AppData['profile'];
  if (profile) {
    if (!isObj(profile.clearances)) errors.push('Freigaben im Profil fehlen.');
    else for (const k of CLEARANCE_KEYS) if (!isObj((profile.clearances as Record<string, unknown>)[k])) (profile.clearances as Record<string, unknown>)[k] = { key: k, status: 'unknown' };
  }
  if (errors.length) return { ok: false, errors };

  const data: AppData = {
    profile,
    settings: { ...DEFAULT_SETTINGS, ...(isObj(raw.settings) ? (raw.settings as object) : {}) },
    sessions,
    followUps: raw.followUps as AppData['followUps'],
    tests: raw.tests as AppData['tests'],
    adjustments: raw.adjustments as AppData['adjustments']
  };
  return { ok: true, data, summary: `${sessions.length} Einheiten, ${data.followUps.length} Folgetagsabfragen, ${data.tests.length} Funktionstests` };
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Trainingshistorie als CSV (Semikolon-getrennt, Excel-kompatibel für DE). */
export function sessionsToCSV(data: Pick<AppData, 'sessions' | 'followUps'>): string {
  const header = [
    'Datum', 'Einheit-ID', 'Übung', 'Geplant', 'Tatsächlich', 'Sätze', 'Wiederholungen', 'Dauer (s)', 'Gewicht (kg)', 'Widerstand',
    'Übersprungen', 'RPE', 'Schmerz vorher', 'Schmerz während', 'Schmerz nachher', 'Schwellung', 'Gangbild', 'Bewegungsqualität', 'Stabilität',
    'Ermüdung', 'Warnzeichen', 'Notiz', 'Folgetag Schmerz', 'Folgetag Schwellung', 'Folgetag Steifigkeit', 'Folgetag Gangbild', 'Folgetag Beweglichkeit', 'Folgetag Belastbarkeit'
  ];
  const rows = [header.join(';')];
  const fuBy = new Map(data.followUps.map((f) => [f.sessionId, f]));
  for (const s of [...data.sessions].filter((x) => x.status === 'completed').sort((a, b) => a.date.localeCompare(b.date))) {
    const f = fuBy.get(s.id);
    for (const e of s.exercises) {
      rows.push(
        [
          s.date, s.id, ExerciseDatabase.get(e.exerciseId)?.name ?? e.exerciseId, formatPrescription(e.planned), formatPrescription(e.actual),
          e.actual.sets, e.actual.reps, e.actual.durationSec ?? (e.actual.runSec !== undefined ? e.actual.runSec * (e.actual.rounds ?? 1) : ''), e.actual.weightKg, e.actual.resistance,
          e.skipped ? 'ja' : 'nein', e.rpe, s.painBefore, e.painDuring, s.painAfter, s.swelling, s.gait, e.movementQuality, e.stability,
          s.fatigue, s.warnings.join(','), [s.notes, e.notes].filter(Boolean).join(' | '), f?.pain, f?.swelling, f?.stiffness, f?.gait, f?.mobility, f?.overallCapacity
        ]
          .map(csvCell)
          .join(';')
      );
    }
  }
  return rows.join('\n');
}
