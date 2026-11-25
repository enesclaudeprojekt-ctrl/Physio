import type {
  ClearanceKey,
  ExerciseLog,
  FollowUpCheck,
  FunctionalTest,
  ManualAdjustment,
  Prescription,
  TrainingSession,
  UserProfile
} from '../src/domain/types';
import { CLEARANCE_KEYS } from '../src/domain/types';
import { createEmptyProfile } from '../src/engine/userProfileEngine';
import { evaluateRehab } from '../src/engine/rehabEngine';
import { buildContext, type EngineInput } from '../src/engine/context';
import { addDays } from '../src/utils/date';

export const START = '2026-03-02';

export function profileWith(cleared: ClearanceKey[] = ['fullWeightBearing', 'strengthTraining', 'calfRaises', 'cycling'], patch: Partial<UserProfile> = {}): UserProfile {
  const p = createEmptyProfile('2026-03-01T08:00:00.000Z');
  for (const k of CLEARANCE_KEYS) {
    p.clearances[k] = cleared.includes(k) ? { key: k, status: 'granted', date: '2026-02-20', source: 'Unfallchirurgie' } : { key: k, status: 'unknown' };
  }
  p.baseline = {
    ...p.baseline,
    walkingMinutes: 30,
    painFreeWalking: true,
    briskWalking: false,
    bilateralCalfRaise: true,
    bilateralCalfRaiseReps: 15,
    singleLegStand: true,
    singleLegStandSeconds: 15,
    ankleMobility: 'limited',
    swelling: 0,
    painLevel: 1
  };
  p.onboardingCompleted = true;
  p.sessionsPerWeek = 7;
  p.availableMinutes = 120;
  return { ...p, ...patch };
}

let n = 0;
export interface LogSpec {
  exerciseId: string;
  planned: Prescription;
  actual?: Prescription;
  painDuring?: number;
  rpe?: number;
  quality?: ExerciseLog['movementQuality'];
  skipped?: boolean;
}

export function session(date: string, logs: LogSpec[], patch: Partial<TrainingSession> = {}): TrainingSession {
  n++;
  return {
    id: `s${n}_${date}`,
    date,
    startedAt: `${date}T17:00:00.000Z`,
    completedAt: `${date}T18:00:00.000Z`,
    status: 'completed',
    painBefore: 0,
    painAfter: 0,
    swelling: 0,
    gait: 'normal',
    fatigue: 4,
    warnings: [],
    exercises: logs.map((l) => ({
      exerciseId: l.exerciseId,
      planned: l.planned,
      actual: l.actual ?? l.planned,
      completed: !l.skipped,
      skipped: !!l.skipped,
      rpe: l.rpe ?? 4,
      painDuring: l.painDuring ?? 0,
      movementQuality: l.quality ?? 'controlled',
      stability: 4
    })),
    ...patch
  };
}

export function followUp(s: TrainingSession, patch: Partial<FollowUpCheck> = {}): FollowUpCheck {
  return {
    id: `f_${s.id}`,
    sessionId: s.id,
    date: addDays(s.date, 1),
    pain: 0,
    swelling: 0,
    stiffness: 0,
    gait: 'normal',
    mobility: 'same',
    overallCapacity: 8,
    warnings: [],
    ...patch
  };
}

export function input(profile: UserProfile, sessions: TrainingSession[], followUps: FollowUpCheck[], today: string, extra: { tests?: FunctionalTest[]; adjustments?: ManualAdjustment[] } = {}): EngineInput {
  return { profile, sessions, followUps, tests: extra.tests ?? [], adjustments: extra.adjustments ?? [], today };
}

export function run(profile: UserProfile, sessions: TrainingSession[], followUps: FollowUpCheck[], today: string, extra: { tests?: FunctionalTest[]; adjustments?: ManualAdjustment[] } = {}) {
  return evaluateRehab(input(profile, sessions, followUps, today, extra));
}

export function ctxOf(profile: UserProfile, sessions: TrainingSession[], followUps: FollowUpCheck[], today: string, extra: { tests?: FunctionalTest[]; adjustments?: ManualAdjustment[] } = {}) {
  return buildContext(input(profile, sessions, followUps, today, extra));
}

export function test_(key: FunctionalTest['key'], value: number, date = START): FunctionalTest {
  return { id: `t_${key}_${date}`, key, value, date };
}
