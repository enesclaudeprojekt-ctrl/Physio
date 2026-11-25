/**
 * Adaptive Rehabilitation Engine – Fassade.
 *
 * Verbindet alle Module in fester, nachvollziehbarer Reihenfolge:
 *   Kontext → Safety → Progression (Replay je Familie) → Laufmodul →
 *   Funktionelle Bereitschaft → Return-to-Football → Scheduler → Analytics.
 * Rein funktional: gleiche Eingaben ⇒ gleiche Ausgaben.
 */
import type { DecisionRecord, ExerciseState, ISODate, Prescription, ProgressionVariable } from '../domain/types';
import { buildContext, type EngineContext, type EngineInput } from './context';
import { ExerciseDatabase } from './exerciseDatabase';
import { ExerciseProgressionEngine, nextProgressionStep, requiredTolerated, type FamilyResult } from './exerciseProgressionEngine';
import { FunctionalReadinessEngine, type FunctionalMetrics, type ReadinessResult } from './functionalReadinessEngine';
import { LoadManagementEngine, type RegionLoadRow } from './loadManagementEngine';
import { ReturnToFootballEngine, type FootballPhase } from './returnToFootballEngine';
import { RunningProgressionEngine, type RunningPlan, type RunningState } from './runningProgressionEngine';
import { SafetyGateEngine, type GlobalSafety } from './safetyGateEngine';
import { latestRecovery, TrainingScheduler, type DailyPlan } from './trainingScheduler';
import { MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import { formatVariableValue } from './prescription';

export interface NextProgression {
  exerciseId: string;
  variable: ProgressionVariable;
  from: Prescription;
  to: Prescription;
  remainingSessions: number;
  text: string;
}

export interface RehabPhaseInfo {
  index: number;
  name: string;
  description: string;
}

export interface RehabEvaluation {
  ctx: EngineContext;
  date: ISODate;
  safety: GlobalSafety;
  families: Map<string, FamilyResult>;
  familyStates: Map<string, ExerciseState>;
  decisions: DecisionRecord[];
  running: RunningState;
  runningPlan: RunningPlan;
  readiness: ReadinessResult[];
  metrics: FunctionalMetrics;
  football: { currentPhase: number; phases: FootballPhase[] };
  plan: DailyPlan;
  regionMatrix: RegionLoadRow[];
  phase: RehabPhaseInfo;
  nextProgressions: NextProgression[];
}

export const REHAB_PHASES: Omit<RehabPhaseInfo, 'index'>[] = [
  { name: 'Mobilisation & Grundlagen', description: 'Unbelastete Mobilisation, bis Freigaben dokumentiert sind.' },
  { name: 'Grundkraft & Gehfähigkeit', description: 'Aufbau von Wade, Oberschenkel, Hüfte und sauberem Gangbild.' },
  { name: 'Belastungsaufbau', description: 'Höhere Varianten, längeres Gehen, Gleichgewicht auf einem Bein.' },
  { name: 'Laufaufbau', description: 'Kontrollierter Wiedereinstieg ins Laufen nach Stufen.' },
  { name: 'Sportartspezifischer Aufbau', description: 'Beschleunigung, Abbremsen, Richtungswechsel, Sprünge.' },
  { name: 'Return to Football', description: 'Ball- und Mannschaftstraining nach Freigabe.' }
];

function determinePhase(ev: Omit<RehabEvaluation, 'phase' | 'nextProgressions'>): RehabPhaseInfo {
  let index = 0;
  const p = ev.ctx.profile;
  if (MedicalRestrictionsEngine.isCleared(p, 'fullWeightBearing') && MedicalRestrictionsEngine.isCleared(p, 'strengthTraining')) index = 1;
  const calf = ev.familyStates.get('calf_raise');
  const calfLevel = calf ? ExerciseDatabase.get(calf.exerciseId)?.familyLevel ?? 0 : 0;
  if (index >= 1 && calfLevel >= 3 && (ev.metrics.walkingMinTolerated ?? 0) >= 30) index = 2;
  if (ev.running.totalRuns > 0) index = 3;
  if (ev.football.currentPhase >= 3) index = 4;
  if (ev.football.currentPhase >= 9) index = 5;
  return { index, ...REHAB_PHASES[index] };
}

export function evaluateRehab(input: EngineInput): RehabEvaluation {
  const ctx = buildContext(input);
  const date = input.today;
  const safety = SafetyGateEngine.global({ profile: ctx.profile, sessions: ctx.completed, followUps: ctx.followUps, adjustments: ctx.adjustments, date });

  const families = new Map<string, FamilyResult>();
  for (const f of ExerciseDatabase.families()) {
    if (f === 'running') continue;
    const r = ExerciseProgressionEngine.replayFamily(f, ctx);
    if (r) families.set(f, r);
  }
  const familyStates = new Map([...families].map(([k, v]) => [k, v.state]));

  const running = RunningProgressionEngine.replay(ctx);
  const { metrics, categories: readiness } = FunctionalReadinessEngine.evaluate(ctx, running, date);
  const runReady = readiness.find((r) => r.category === 'runStart')!;
  const runningPlan = RunningProgressionEngine.planFor(ctx, running, date, runReady);
  const football = ReturnToFootballEngine.evaluate(ctx, running, familyStates, readiness);

  const plan = TrainingScheduler.generate({ ctx, families, safety, runningPlan, footballPhase: football.currentPhase, date });
  const decisions = [...[...families.values()].flatMap((f) => f.decisions), ...running.decisions].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const regionMatrix = LoadManagementEngine.regionMatrix(ctx.daily, date);

  const partial = { ctx, date, safety, families, familyStates, decisions, running, runningPlan, readiness, metrics, football, plan, regionMatrix };
  const phase = determinePhase(partial);

  const nextProgressions: NextProgression[] = [];
  for (const [, fr] of families) {
    if (fr.untouched || fr.state.paused) continue;
    const def = ExerciseDatabase.require(fr.state.exerciseId);
    const step = nextProgressionStep(def, fr.state.current, { conservative: fr.state.conservativeLevel > 0 });
    if (!step) continue;
    const remaining = Math.max(0, requiredTolerated(fr.state) - fr.state.toleratedAtLevel);
    nextProgressions.push({
      exerciseId: def.id,
      variable: step.variable,
      from: fr.state.current,
      to: step.to,
      remainingSessions: remaining,
      text: `${def.name}: ${formatVariableValue(fr.state.current, step.variable)} → ${formatVariableValue(step.to, step.variable)} (noch ${remaining} gut verträgliche Einheit${remaining === 1 ? '' : 'en'} nötig, inkl. Folgetag)`
    });
  }
  nextProgressions.sort((a, b) => a.remainingSessions - b.remainingSessions);

  return { ...partial, phase, nextProgressions };
}

export { latestRecovery };
