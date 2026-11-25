/**
 * Progressionsscore 0–100.
 *
 * Jeder Faktor wird auf 0..1 normalisiert und gewichtet. Fehlende Daten
 * zählen 0 Punkte (niemals positiv) und werden als „fehlend“ ausgewiesen.
 * Der Score ist eine technische Entscheidungshilfe und kann weder fehlende
 * Freigaben noch Warnsymptome kompensieren (siehe SafetyGateEngine).
 */
import type { ExerciseLog, FollowUpCheck, ScoreBreakdown, TrainingSession } from '../domain/types';
import { SCORE_BANDS, SCORE_WEIGHTS } from './config';
import { completionRatio } from './prescription';
import { gaitSeverity } from './recoveryAssessmentEngine';

export function normalizePain(p: number): number {
  const table = [1, 0.9, 0.75, 0.5, 0.3, 0.1];
  return p >= table.length ? 0 : table[Math.max(0, Math.round(p))];
}
export function normalizeSwelling(s: number): number {
  return [1, 0.5, 0.1, 0][s] ?? 0;
}
export function normalizeFatigue(f: number): number {
  if (f <= 5) return 1;
  return [0.8, 0.6, 0.35, 0.15, 0][Math.min(4, Math.round(f) - 6)];
}

export function scoreBand(total: number): ScoreBreakdown['band'] {
  if (total >= SCORE_BANDS.progress) return 'progress';
  if (total >= SCORE_BANDS.maintain) return 'maintain';
  if (total >= SCORE_BANDS.review) return 'review';
  return 'noProgress';
}

export const BAND_LABEL: Record<ScoreBreakdown['band'], string> = {
  progress: 'Progression kann geprüft werden',
  maintain: 'Belastung beibehalten',
  review: 'Belastung überprüfen',
  noProgress: 'Keine Progression, Belastung überprüfen'
};

export function computeProgressionScore(session: TrainingSession, log: ExerciseLog | undefined, followUp: FollowUpCheck | undefined): ScoreBreakdown {
  const missing: string[] = [];

  // Schmerz: schlechtester verfügbarer Wert
  const painVals = [log?.painDuring, session.painAfter, followUp?.pain].filter((x): x is number => typeof x === 'number');
  const pain = painVals.length ? normalizePain(Math.max(...painVals)) : null;
  if (pain === null) missing.push('Schmerz');

  const swVals = [session.swelling, followUp?.swelling].filter((x): x is NonNullable<typeof x> => x !== undefined);
  const swelling = swVals.length ? normalizeSwelling(Math.max(...swVals)) : null;
  if (swelling === null) missing.push('Schwellung');

  const gVals = [gaitSeverity(session.gait), gaitSeverity(followUp?.gait)].filter((x): x is number => x !== null);
  const gait = gVals.length ? [1, 0.5, 0][Math.max(...gVals)] : null;
  if (gait === null) missing.push('Gangbild');

  const quality = log?.movementQuality ? { controlled: 1, slightlyLimited: 0.6, clearlyLimited: 0.2, painful: 0 }[log.movementQuality] : null;
  if (quality === null) missing.push('Bewegungsqualität');

  const performance = log && !log.skipped ? completionRatio(log.planned, log.actual) : null;
  if (performance === null) missing.push('Leistung');

  const f = log?.rpe ?? session.fatigue;
  const fatigue = f !== undefined ? normalizeFatigue(f) : null;
  if (fatigue === null) missing.push('Ermüdung');

  let regeneration: number | null = null;
  if (followUp) {
    regeneration = [1, 0.6, 0.25, 0][followUp.stiffness];
    if (followUp.mobility === 'worse') regeneration *= 0.5;
    if (followUp.overallCapacity < 5) regeneration *= 0.7;
  } else missing.push('Folgetagsreaktion');

  const parts: { key: ScoreBreakdown['components'][number]['key']; label: string; v: number | null }[] = [
    { key: 'pain', label: 'Schmerzreaktion', v: pain },
    { key: 'swelling', label: 'Schwellung', v: swelling },
    { key: 'gait', label: 'Gangbild', v: gait },
    { key: 'quality', label: 'Bewegungsqualität', v: quality },
    { key: 'performance', label: 'Leistungsfähigkeit', v: performance },
    { key: 'fatigue', label: 'Ermüdung', v: fatigue },
    { key: 'regeneration', label: 'Regeneration', v: regeneration }
  ];

  const components = parts.map((p) => {
    const weight = SCORE_WEIGHTS[p.key];
    const points = p.v === null ? 0 : Math.round(p.v * weight * 10) / 10;
    return { key: p.key, label: p.label, weight, normalized: p.v, points };
  });
  const total = Math.round(components.reduce((s, c) => s + c.points, 0) * 10) / 10;
  return { total, components, missing, band: scoreBand(total) };
}
