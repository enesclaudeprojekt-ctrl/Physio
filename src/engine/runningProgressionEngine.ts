/**
 * RunningProgressionEngine
 *
 * Eigenständiges Laufmodul mit Stufen A–K. Die Stufen sind KEINE zeitliche
 * Vorgabe. Ohne dokumentierte Lauf-Freigabe bleibt das Modul gesperrt.
 * Zusätzlich müssen funktionelle Kriterien (FunctionalReadinessEngine) erfüllt
 * sein. Eine Progression wird erst nach mindestens zwei verträglichen
 * Einheiten auf derselben Stufe geprüft.
 */
import type { DecisionRecord, DecisionType, ISODate, Prescription, ReasonCode } from '../domain/types';
import { PROGRESSION_CONFIG } from './config';
import { evalKey, sessionTimestamp, type EngineContext } from './context';
import { DecisionExplanationEngine } from './decisionExplanationEngine';
import { ExerciseDatabase } from './exerciseDatabase';
import { computeExerciseLoad, LoadManagementEngine, REGION_LABEL } from './loadManagementEngine';
import { MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import { SafetyGateEngine } from './safetyGateEngine';
import { addDays, daysBetween } from '../utils/date';

export interface RunStage {
  id: string;
  label: string;
  runSec?: number;
  walkSec?: number;
  rounds?: number;
  durationSec?: number;
}

export const RUN_STAGES: RunStage[] = [
  { id: 'A', label: '30 s Joggen / 90 s Gehen', runSec: 30, walkSec: 90, rounds: 8 },
  { id: 'B', label: '60 s Joggen / 90 s Gehen', runSec: 60, walkSec: 90, rounds: 7 },
  { id: 'C', label: '90 s Joggen / 90 s Gehen', runSec: 90, walkSec: 90, rounds: 6 },
  { id: 'D', label: '2 min Joggen / 1 min Gehen', runSec: 120, walkSec: 60, rounds: 6 },
  { id: 'E', label: '3 min Joggen / 1 min Gehen', runSec: 180, walkSec: 60, rounds: 5 },
  { id: 'F', label: '5 min Joggen / 1 min Gehen', runSec: 300, walkSec: 60, rounds: 4 },
  { id: 'G', label: '8 min Joggen / 1 min Gehen', runSec: 480, walkSec: 60, rounds: 3 },
  { id: 'H', label: '10 min Joggen / 1 min Gehen', runSec: 600, walkSec: 60, rounds: 3 },
  { id: 'I', label: '15 min kontinuierlich', durationSec: 900 },
  { id: 'J', label: '20 min kontinuierlich', durationSec: 1200 },
  { id: 'K', label: '30 min kontinuierlich', durationSec: 1800 }
];

export function stagePrescription(index: number): { exerciseId: string; prescription: Prescription } {
  const st = RUN_STAGES[Math.max(0, Math.min(RUN_STAGES.length - 1, index))];
  if (st.durationSec) return { exerciseId: 'continuous_jog', prescription: { durationSec: st.durationSec, stage: st.id } };
  return { exerciseId: 'run_walk_intervals', prescription: { runSec: st.runSec, walkSec: st.walkSec, rounds: st.rounds, stage: st.id } };
}

export function stageIndexOf(p: Prescription): number {
  if (p.stage) {
    const i = RUN_STAGES.findIndex((s) => s.id === p.stage);
    if (i >= 0) return i;
  }
  if (p.runSec !== undefined) {
    const i = RUN_STAGES.findIndex((s) => s.runSec === p.runSec && s.walkSec === p.walkSec);
    if (i >= 0) return i;
  }
  if (p.durationSec !== undefined) {
    const i = RUN_STAGES.findIndex((s) => s.durationSec === p.durationSec);
    if (i >= 0) return i;
  }
  return 0;
}

export interface RunningState {
  stageIndex: number;
  toleratedAtStage: number;
  totalRuns: number;
  lastRun?: ISODate;
  paused: boolean;
  /** Höchste je erreichte Stufe */
  peakStageIndex: number;
  decisions: DecisionRecord[];
}

export type RunningPlanStatus = 'locked' | 'notReady' | 'restDay' | 'paused' | 'blocked' | 'run';

export interface RunningPlan {
  status: RunningPlanStatus;
  stageIndex: number;
  exerciseId?: string;
  prescription?: Prescription;
  reasons: ReasonCode[];
  explanation: string;
}

const RUN_IDS = new Set(['run_walk_intervals', 'continuous_jog']);

export const RunningProgressionEngine = {
  replay(ctx: EngineContext): RunningState {
    const state: RunningState = { stageIndex: 0, toleratedAtStage: 0, totalRuns: 0, paused: false, peakStageIndex: 0, decisions: [] };
    type Ev = { ts: string; kind: 'log'; sessionId: string; index: number; date: ISODate } | { ts: string; kind: 'clear'; date: ISODate };
    const events: Ev[] = [];
    for (const s of ctx.completed) s.exercises.forEach((l, index) => RUN_IDS.has(l.exerciseId) && !l.skipped && events.push({ ts: sessionTimestamp(s), kind: 'log', sessionId: s.id, index, date: s.date }));
    for (const a of ctx.adjustments) if (a.action === 'warningCleared' && a.date <= ctx.today) events.push({ ts: a.createdAt, kind: 'clear', date: a.date });
    events.sort((a, b) => a.ts.localeCompare(b.ts));

    const record = (date: ISODate, type: DecisionType, fromIdx: number, reasons: ReasonCode[], extra: Partial<DecisionRecord> = {}) => {
      const from = stagePrescription(fromIdx);
      const to = stagePrescription(state.stageIndex);
      const d: DecisionRecord = {
        id: `run_${date}_${state.totalRuns}_${state.decisions.length}`,
        date,
        exerciseId: to.exerciseId,
        type,
        from: from.prescription,
        to: to.prescription,
        reasons,
        context: { tolerated: state.toleratedAtStage, required: PROGRESSION_CONFIG.runningToleratedRequired, fromStage: RUN_STAGES[fromIdx].id, toStage: RUN_STAGES[state.stageIndex].id },
        explanation: '',
        statusAfter: state.paused ? 'Paused' : type === 'progress' ? 'ProgressionApproved' : type === 'regress' ? 'RegressionRequired' : 'Stable',
        ...extra
      };
      const stageText =
        type === 'progress'
          ? `Laufstufe ${RUN_STAGES[fromIdx].id} → ${RUN_STAGES[state.stageIndex].id} (${RUN_STAGES[state.stageIndex].label}).`
          : type === 'regress' || type === 'deload'
            ? `Laufstufe wird von ${RUN_STAGES[fromIdx].id} auf ${RUN_STAGES[state.stageIndex].id} reduziert (${RUN_STAGES[state.stageIndex].label}).`
            : type === 'stop'
              ? 'Lauftraining gestoppt.'
              : `Laufstufe ${RUN_STAGES[state.stageIndex].id} bleibt (${RUN_STAGES[state.stageIndex].label}).`;
      const rest = DecisionExplanationEngine.explain(d).split('. ').slice(1).join('. ');
      d.explanation = `${stageText} ${rest}`.trim();
      state.decisions.push(d);
    };

    for (const ev of events) {
      if (ev.kind === 'clear') {
        if (state.paused) {
          const f = state.stageIndex;
          state.paused = false;
          state.stageIndex = Math.max(0, state.stageIndex - 1);
          state.toleratedAtStage = 0;
          record(ev.date, 'regress', f, ['warningSymptom']);
        }
        continue;
      }
      const e = ctx.evaluations.get(evalKey(ev.sessionId, ev.index));
      if (!e) continue;
      // Stufe aus der tatsächlich geplanten Einheit übernehmen
      state.stageIndex = stageIndexOf(e.log.planned);
      state.totalRuns++;
      state.lastRun = ev.date;
      const fromIdx = state.stageIndex;
      const load = computeExerciseLoad(ExerciseDatabase.require(e.log.exerciseId), e.log.actual);
      const base = { sessionId: ev.sessionId, score: e.score, recovery: e.recovery, load };

      if (e.recovery.status === 'red') {
        state.paused = true;
        state.toleratedAtStage = 0;
        record(ev.date, 'stop', fromIdx, ['recoveryRed', ...(e.recovery.warnings.length ? (['warningSymptom'] as ReasonCode[]) : [])], base);
        continue;
      }
      if (state.paused) {
        record(ev.date, 'hold', fromIdx, ['warningSymptom'], base);
        continue;
      }
      const runPain = e.log.painDuring ?? 0;
      if (e.recovery.status === 'orange' || runPain >= PROGRESSION_CONFIG.runningPainRegress) {
        state.stageIndex = Math.max(0, state.stageIndex - 1);
        state.toleratedAtStage = 0;
        record(ev.date, 'regress', fromIdx, ['recoveryOrange', ...e.recovery.flags.filter((f) => ['swelling', 'gaitAltered', 'painIncrease'].includes(f))], base);
        continue;
      }
      if (e.recovery.status === 'yellow') {
        state.toleratedAtStage = 0;
        record(ev.date, 'hold', fromIdx, ['recoveryYellow'], base);
        continue;
      }
      if (!e.recovery.hasFollowUp) {
        record(ev.date, 'hold', fromIdx, ['followUpMissing'], base);
        continue;
      }
      if (!e.tolerated) {
        record(ev.date, 'hold', fromIdx, [e.completion < 0.9 ? 'strengthLoss' : 'scoreMaintain'], base);
        continue;
      }
      state.toleratedAtStage++;
      if (state.toleratedAtStage >= PROGRESSION_CONFIG.runningToleratedRequired && state.stageIndex < RUN_STAGES.length - 1) {
        const target = ExerciseDatabase.require(stagePrescription(state.stageIndex + 1).exerciseId);
        const gate = SafetyGateEngine.checkProgression({
          profile: ctx.profile,
          target,
          recovery: e.recovery,
          score: e.score,
          regionStatus: LoadManagementEngine.exerciseRegionStatus(ctx.daily, ev.date, target),
          global: SafetyGateEngine.global({ ...ctx, sessions: ctx.completed, date: ev.date }),
          strengthLoss: false
        });
        if (gate.allowed) {
          const tol = state.toleratedAtStage;
          state.stageIndex++;
          state.toleratedAtStage = 0;
          state.peakStageIndex = Math.max(state.peakStageIndex, state.stageIndex);
          record(ev.date, 'progress', fromIdx, ['toleratedSessions', 'followUpUnremarkable', 'scoreHigh'], { ...base, context: { tolerated: tol, required: PROGRESSION_CONFIG.runningToleratedRequired } });
        } else {
          record(ev.date, 'hold', fromIdx, ['toleratedSessions', ...gate.reasons], { ...base, context: { ...gate.context, tolerated: state.toleratedAtStage } });
        }
      } else {
        record(ev.date, 'hold', fromIdx, state.stageIndex === RUN_STAGES.length - 1 ? ['toleratedSessions', 'ladderMaxed'] : ['notEnoughTolerated'], base);
      }
    }
    return state;
  },

  /** Laufplanung für ein Datum. runReadiness = Ergebnis der FunctionalReadinessEngine (Kategorie Laufbeginn). */
  planFor(ctx: EngineContext, state: RunningState, date: ISODate, runReadiness: { criteriaMet: boolean; missing: string[] }): RunningPlan {
    const base = { stageIndex: state.stageIndex };
    if (!MedicalRestrictionsEngine.isCleared(ctx.profile, 'jogging')) {
      return { ...base, status: 'locked', reasons: ['missingClearance'], explanation: 'Heute findet kein Lauftraining statt, da deine medizinische Lauf-Freigabe noch nicht dokumentiert ist.' };
    }
    if (state.paused) {
      return { ...base, status: 'paused', reasons: ['warningSymptom'], explanation: 'Lauftraining pausiert: Es wurde ein Warnzeichen dokumentiert. Bitte zuerst ärztlich abklären lassen.' };
    }
    if (state.totalRuns === 0 && !runReadiness.criteriaMet) {
      return {
        ...base,
        status: 'notReady',
        reasons: ['missingPrerequisite'],
        explanation: `Lauf-Freigabe ist dokumentiert, aber funktionelle Voraussetzungen fehlen noch: ${runReadiness.missing.join('; ')}.`
      };
    }
    if (state.lastRun && daysBetween(state.lastRun, date) < 1 + PROGRESSION_CONFIG.runningRestDays && state.lastRun !== date) {
      return { ...base, status: 'restDay', reasons: ['restDayRequired'], explanation: `Heute kein Lauftraining: Die letzte Laufeinheit war am ${state.lastRun}. Zwischen zwei Laufeinheiten ist mindestens ein Ruhetag vorgesehen.` };
    }
    let idx = state.stageIndex;
    const reasons: ReasonCode[] = [];
    let explanation = `Laufstufe ${RUN_STAGES[idx].id}: ${RUN_STAGES[idx].label}.`;
    if (state.lastRun) {
      const gap = daysBetween(state.lastRun, date);
      if (gap >= PROGRESSION_CONFIG.gapReduceDays) {
        const steps = gap >= PROGRESSION_CONFIG.gapStrongReduceDays ? 2 : 1;
        idx = Math.max(0, idx - steps);
        reasons.push('trainingGap');
        explanation = `Seit dem letzten Lauf sind ${gap} Tage vergangen – Wiedereinstieg mit Stufe ${RUN_STAGES[idx].id} (${RUN_STAGES[idx].label}) statt ${RUN_STAGES[state.stageIndex].id}.`;
      }
    }
    const sp = stagePrescription(idx);
    const def = ExerciseDatabase.require(sp.exerciseId);
    const region = LoadManagementEngine.exerciseRegionStatus(ctx.daily, addDays(date, -1), def);
    if (region.worst === 'spike') {
      return {
        ...base,
        status: 'blocked',
        reasons: ['regionLoadSpike'],
        explanation: `Heute kein Lauftraining: Für ${region.regions.map((r) => REGION_LABEL[r]).join(', ')} wurde eine Belastungsspitze erkannt. Wir planen eine alternative Einheit.`
      };
    }
    const last = state.decisions[state.decisions.length - 1];
    if (last && !reasons.length) explanation = last.explanation;
    return { status: 'run', stageIndex: idx, exerciseId: sp.exerciseId, prescription: sp.prescription, reasons, explanation };
  }
};
