/**
 * Reproduzierbare Simulation der Progressionslogik (Master-Prompt Abschnitt 25).
 * Wird in Tests, im Skript `npm run simulate` und in der App (Einstellungen → Simulation) genutzt.
 */
import type { FollowUpCheck, TrainingSession } from '../domain/types';
import { CLEARANCE_KEYS } from '../domain/types';
import { evaluateRehab } from './rehabEngine';
import { createEmptyProfile } from './userProfileEngine';
import { formatMain } from './prescription';
import { addDays } from '../utils/date';

export interface SimulationRow {
  unit: number;
  date: string;
  input: string;
  score: number;
  recovery: string;
  load: number;
  decision: string;
  explanation: string;
  newPrescription: string;
}

export function runCalfRaiseSimulation(start = '2026-03-02'): SimulationRow[] {
  const profile = createEmptyProfile('2026-03-01T08:00:00.000Z');
  for (const k of CLEARANCE_KEYS) profile.clearances[k] = { key: k, status: ['fullWeightBearing', 'strengthTraining', 'calfRaises'].includes(k) ? 'granted' : 'unknown', date: '2026-02-20', source: 'Simulation' };
  profile.baseline = { ...profile.baseline, bilateralCalfRaise: true, bilateralCalfRaiseReps: 15, walkingMinutes: 30, painFreeWalking: true };
  profile.onboardingCompleted = true;
  profile.sessionsPerWeek = 7;

  const units = [
    { reps: 10, pain: 1, swelling: 0, stiffness: 0, text: '3 × 10, Schmerz 1/10 während/danach, keine Schwellung, Gang normal, Folgetag unauffällig' },
    { reps: 10, pain: 0, swelling: 0, stiffness: 0, text: '3 × 10, Schmerz 0/10, keine Schwellung, Folgetag unauffällig' },
    { reps: 10, pain: 0, swelling: 0, stiffness: 0, text: '3 × 10, Schmerz 0/10, keine Schwellung, Folgetag unauffällig' },
    { reps: 12, pain: 2, swelling: 1, stiffness: 1, text: '3 × 12, Schmerz 2/10, leichte Schwellung, leichte Steifigkeit am Folgetag' },
    { reps: 12, pain: 0, swelling: 0, stiffness: 0, text: '3 × 12, Schmerz 0/10, keine Schwellung, normale Folgetagsreaktion' }
  ];
  const sessions: TrainingSession[] = [];
  const followUps: FollowUpCheck[] = [];
  const rows: SimulationRow[] = [];
  units.forEach((u, i) => {
    const date = addDays(start, i * 2);
    const planned = { sets: 3, reps: u.reps, restSec: 60, tempo: 'normal' as const };
    const s: TrainingSession = {
      id: `sim${i + 1}`,
      date,
      startedAt: `${date}T17:00:00.000Z`,
      completedAt: `${date}T17:30:00.000Z`,
      status: 'completed',
      painBefore: 0,
      painAfter: u.pain,
      swelling: u.swelling as 0 | 1,
      gait: 'normal',
      fatigue: 4,
      warnings: [],
      exercises: [{ exerciseId: 'bilateral_calf_raise', planned, actual: planned, completed: true, skipped: false, rpe: 4, painDuring: u.pain, movementQuality: 'controlled', stability: 4 }]
    };
    sessions.push(s);
    followUps.push({ id: `simf${i + 1}`, sessionId: s.id, date: addDays(date, 1), pain: u.stiffness ? 1 : 0, swelling: 0, stiffness: u.stiffness as 0 | 1, gait: 'normal', mobility: 'same', overallCapacity: 8, warnings: [] });
    const ev = evaluateRehab({ profile, sessions: [...sessions], followUps: [...followUps], tests: [], adjustments: [], today: addDays(date, 1) });
    const fr = ev.families.get('calf_raise')!;
    const d = fr.decisions[fr.decisions.length - 1];
    rows.push({
      unit: i + 1,
      date,
      input: u.text,
      score: d.score?.total ?? 0,
      recovery: d.recovery?.status ?? '-',
      load: d.load ?? 0,
      decision: d.type,
      explanation: d.explanation,
      newPrescription: formatMain(fr.state.current)
    });
  });
  return rows;
}
