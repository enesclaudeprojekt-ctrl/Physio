/**
 * Gemeinsamer Auswertungskontext. Wird einmal pro Auswertung aufgebaut und
 * von allen Engines gelesen (keine Seiteneffekte, keine Persistenz).
 */
import type {
  ExerciseLog,
  FollowUpCheck,
  FunctionalTest,
  FunctionalTestKey,
  ISODate,
  ManualAdjustment,
  Prescription,
  RecoveryAssessment,
  ScoreBreakdown,
  TrainingSession,
  UserProfile
} from '../domain/types';
import { LoadManagementEngine, type DayLoad } from './loadManagementEngine';
import { RecoveryAssessmentEngine } from './recoveryAssessmentEngine';
import { computeProgressionScore } from './progressionScore';
import { completionRatio } from './prescription';

export interface EngineInput {
  profile: UserProfile;
  sessions: TrainingSession[];
  followUps: FollowUpCheck[];
  tests: FunctionalTest[];
  adjustments: ManualAdjustment[];
  today: ISODate;
}

export interface LogEvaluation {
  session: TrainingSession;
  log: ExerciseLog;
  followUp?: FollowUpCheck;
  recovery: RecoveryAssessment;
  score: ScoreBreakdown;
  completion: number;
  /** Gut vertragen: grün, Folgetag vorhanden, Score ≥ 85, Leistung ≥ 90 % */
  tolerated: boolean;
}

export interface EngineContext extends EngineInput {
  /** Abgeschlossene Einheiten bis einschließlich heute, chronologisch */
  completed: TrainingSession[];
  followUpBySession: Map<string, FollowUpCheck>;
  daily: Map<ISODate, DayLoad>;
  evaluations: Map<string, LogEvaluation>;
  /** Verträgliche Ausführungen je Übung (für Voraussetzungen) */
  tolerated: Map<string, { date: ISODate; prescription: Prescription }[]>;
}

export const evalKey = (sessionId: string, index: number) => `${sessionId}#${index}`;

export function sessionTimestamp(s: TrainingSession): string {
  return s.completedAt ?? s.startedAt ?? `${s.date}T12:00:00`;
}

export function buildContext(input: EngineInput): EngineContext {
  const completed = input.sessions
    .filter((s) => s.status === 'completed' && s.date <= input.today)
    .sort((a, b) => (a.date === b.date ? sessionTimestamp(a).localeCompare(sessionTimestamp(b)) : a.date.localeCompare(b.date)));
  const followUpBySession = new Map<string, FollowUpCheck>();
  for (const f of input.followUps) {
    const prev = followUpBySession.get(f.sessionId);
    if (!prev || prev.date < f.date) followUpBySession.set(f.sessionId, f);
  }
  const daily = LoadManagementEngine.dailyLoads(completed);
  const evaluations = new Map<string, LogEvaluation>();
  const tolerated = new Map<string, { date: ISODate; prescription: Prescription }[]>();

  for (const s of completed) {
    const followUp = followUpBySession.get(s.id);
    s.exercises.forEach((log, i) => {
      if (log.skipped) return;
      const recovery = RecoveryAssessmentEngine.assess({ session: s, log, followUp });
      const score = computeProgressionScore(s, log, followUp);
      const completion = completionRatio(log.planned, log.actual);
      const ok = recovery.status === 'green' && recovery.hasFollowUp && score.band === 'progress' && completion >= 0.9;
      evaluations.set(evalKey(s.id, i), { session: s, log, followUp, recovery, score, completion, tolerated: ok });
      if (ok) {
        const arr = tolerated.get(log.exerciseId) ?? [];
        arr.push({ date: s.date, prescription: log.actual });
        tolerated.set(log.exerciseId, arr);
      }
    });
  }
  return { ...input, completed, followUpBySession, daily, evaluations, tolerated };
}

export function latestTest(tests: FunctionalTest[], key: FunctionalTestKey, date: ISODate): FunctionalTest | undefined {
  return tests
    .filter((t) => t.key === key && t.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
}
