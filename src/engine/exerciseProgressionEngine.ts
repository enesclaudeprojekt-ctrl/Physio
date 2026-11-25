/**
 * ExerciseProgressionEngine
 *
 * Deterministische, transparente Progressionssteuerung je Übungsfamilie.
 * Der Zustand wird bei jeder Auswertung vollständig aus der Historie
 * rekonstruiert („Replay“). Dadurch gibt es keine versteckten Zustände:
 * Jede Entscheidung ist aus den gespeicherten Protokollen nachvollziehbar.
 *
 * Regeln (Auszug):
 *  – Pro Entscheidung wird höchstens EINE Belastungsvariable verändert.
 *  – Progression erst nach N gut verträglichen Einheiten auf derselben Stufe
 *    (inkl. Folgetagsreaktion) UND bestandenem Safety-Gate.
 *  – Gelb → halten, Orange → reduzieren, Rot → stoppen.
 *  – Wiederholte Rückschläge → konservativer (mehr Bestätigungseinheiten, halbe Schritte).
 *  – Mehrere gut vertragene Steigerungen → effizienter (eine Bestätigungseinheit weniger).
 *  – Lange Pause → Vorgabe reduzieren (letzte Höchstleistung ≠ aktuelle Belastbarkeit).
 */
import type {
  DecisionRecord,
  DecisionType,
  ExerciseDefinition,
  ExerciseState,
  ExerciseStatus,
  FunctionalPrerequisite,
  ISODate,
  ManualAdjustment,
  Prescription,
  ProgressionVariable,
  ReasonCode,
  ScoreBreakdown,
  RecoveryAssessment
} from '../domain/types';
import { PROGRESSION_CONFIG } from './config';
import { evalKey, latestTest, sessionTimestamp, type EngineContext } from './context';
import { DecisionExplanationEngine } from './decisionExplanationEngine';
import { ExerciseDatabase } from './exerciseDatabase';
import { computeExerciseLoad, LoadManagementEngine } from './loadManagementEngine';
import { MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import { meetsMinimum, nextValue, regressPrescription, setValue } from './prescription';
import { SafetyGateEngine } from './safetyGateEngine';
import { UserProfileEngine } from './userProfileEngine';
import { daysBetween } from '../utils/date';

export interface FamilyResult {
  family: string;
  state: ExerciseState;
  decisions: DecisionRecord[];
  /** Variante der Familie wurde noch nie trainiert */
  untouched: boolean;
}

let decisionCounter = 0;
function decisionId(date: ISODate, exerciseId: string): string {
  decisionCounter = (decisionCounter + 1) % 1_000_000;
  return `dec_${date}_${exerciseId}_${decisionCounter}`;
}

export function freshState(def: ExerciseDefinition, current: Prescription): ExerciseState {
  return {
    exerciseId: def.id,
    status: 'Initial',
    current: { ...current },
    ladderIndex: 0,
    toleratedAtLevel: 0,
    toleratedTotal: 0,
    sessionsAtLevel: 0,
    totalSessions: 0,
    peak: { ...current },
    successfulProgressions: 0,
    setbacks: 0,
    conservativeLevel: 0,
    efficientMode: false,
    paused: false
  };
}

export function requiredTolerated(state: ExerciseState, base: number = PROGRESSION_CONFIG.toleratedSessionsRequired): number {
  let n = base + state.conservativeLevel;
  if (state.efficientMode) n -= 1;
  return Math.max(PROGRESSION_CONFIG.toleratedSessionsMin, n);
}

/** Nächster Progressionsschritt – genau eine Variable. */
export function nextProgressionStep(
  def: ExerciseDefinition,
  current: Prescription,
  opts: { conservative?: boolean; skip?: Set<ProgressionVariable> } = {}
): { variable: ProgressionVariable; to: Prescription; index: number } | null {
  for (let i = 0; i < def.progression.length; i++) {
    const st = def.progression[i];
    if (opts.skip?.has(st.variable)) continue;
    const nv = nextValue(current, st, opts.conservative ? 0.5 : 1);
    if (nv !== undefined) return { variable: st.variable, to: setValue(current, st.variable, nv), index: i };
  }
  return null;
}

export function prerequisitesStatus(def: ExerciseDefinition, ctx: EngineContext, date: ISODate): { met: boolean; missing: FunctionalPrerequisite[] } {
  const missing: FunctionalPrerequisite[] = [];
  for (const pre of def.prerequisites) {
    if (pre.exerciseId) {
      const tol = (ctx.tolerated.get(pre.exerciseId) ?? []).filter((t) => t.date <= date);
      if (!tol.some((t) => meetsMinimum(t.prescription, pre))) missing.push(pre);
    } else if (pre.test) {
      const t = latestTest(ctx.tests, pre.test, date);
      if (!t || t.value < (pre.minValue ?? 0)) missing.push(pre);
    }
  }
  return { met: missing.length === 0, missing };
}

/** Ist die Übung grundsätzlich verfügbar (Freigaben + Voraussetzungen)? */
export function availability(def: ExerciseDefinition, ctx: EngineContext, date: ISODate = ctx.today) {
  const missingClearances = MedicalRestrictionsEngine.missingFor(ctx.profile, def);
  const pre = prerequisitesStatus(def, ctx, date);
  return { available: missingClearances.length === 0 && pre.met, missingClearances, missingPrerequisites: pre.missing };
}

type Event =
  | { kind: 'log'; ts: string; date: ISODate; sessionId: string; index: number }
  | { kind: 'adj'; ts: string; date: ISODate; adj: ManualAdjustment };

export const ExerciseProgressionEngine = {
  /** Rekonstruiert Zustand und Entscheidungen einer Übungsfamilie. */
  replayFamily(family: string, ctx: EngineContext): FamilyResult | null {
    const variants = ExerciseDatabase.family(family);
    if (!variants.length) return null;
    const ids = new Set(variants.map((v) => v.id));

    const events: Event[] = [];
    for (const s of ctx.completed) {
      s.exercises.forEach((log, index) => {
        if (ids.has(log.exerciseId) && !log.skipped) events.push({ kind: 'log', ts: sessionTimestamp(s), date: s.date, sessionId: s.id, index });
      });
    }
    for (const a of ctx.adjustments) {
      if (a.date > ctx.today) continue;
      if ((a.exerciseId && ids.has(a.exerciseId)) || a.action === 'warningCleared') events.push({ kind: 'adj', ts: a.createdAt, date: a.date, adj: a });
    }
    events.sort((a, b) => a.ts.localeCompare(b.ts));

    const startDef = UserProfileEngine.initialVariant(family, ctx.profile) ?? variants[0];
    let def = startDef;
    let state = freshState(def, UserProfileEngine.initialPrescription(def, ctx.profile));
    const decisions: DecisionRecord[] = [];
    let pausedBy: 'manual' | 'warning' | null = null;
    const variableSetbacks = new Map<ProgressionVariable, number>();
    let touched = false;

    const record = (
      date: ISODate,
      type: DecisionType,
      from: Prescription,
      reasons: ReasonCode[],
      extra: Partial<DecisionRecord> & { context?: DecisionRecord['context'] } = {}
    ): DecisionRecord => {
      const d: DecisionRecord = {
        id: decisionId(date, state.exerciseId),
        date,
        exerciseId: state.exerciseId,
        type,
        from,
        to: { ...state.current },
        reasons,
        context: { required: requiredTolerated(state), tolerated: state.toleratedAtLevel, ...(extra.context ?? {}) },
        explanation: '',
        statusAfter: state.status,
        ...extra
      } as DecisionRecord;
      d.context = { required: requiredTolerated(state), tolerated: state.toleratedAtLevel, ...(extra.context ?? {}) };
      d.explanation = DecisionExplanationEngine.explain(d);
      decisions.push(d);
      state.lastDecision = d;
      return d;
    };

    for (const ev of events) {
      if (ev.kind === 'adj') {
        const a = ev.adj;
        const from = { ...state.current };
        if (a.action === 'pause') {
          state.paused = true;
          pausedBy = 'manual';
          state.status = 'Paused';
          record(ev.date, 'pause', from, ['manualPause']);
        } else if (a.action === 'resume') {
          state.paused = false;
          pausedBy = null;
          state.status = 'Stable';
        } else if (a.action === 'regress') {
          const r = regressPrescription(def, state.current, 1);
          state.current = r.to;
          state.toleratedAtLevel = 0;
          state.sessionsAtLevel = 0;
          state.status = 'RegressionRequired';
          record(ev.date, 'regress', from, ['manualRegress'], { changedVariable: r.variable });
        } else if (a.action === 'reset') {
          state = { ...freshState(def, def.defaultPrescription), totalSessions: state.totalSessions, lastPerformed: state.lastPerformed };
          record(ev.date, 'regress', from, ['manualReset']);
        } else if (a.action === 'warningCleared' && pausedBy === 'warning') {
          const r = regressPrescription(def, state.current, 1);
          state.current = r.to;
          state.paused = false;
          pausedBy = null;
          state.toleratedAtLevel = 0;
          state.sessionsAtLevel = 0;
          state.status = 'RegressionRequired';
          record(ev.date, 'regress', from, ['warningSymptom'], { changedVariable: r.variable });
        }
        continue;
      }

      const evaluation = ctx.evaluations.get(evalKey(ev.sessionId, ev.index));
      if (!evaluation) continue;
      const { log, recovery, score, completion } = evaluation;
      touched = true;

      // Variante gewechselt (z. B. manuell eine andere Variante trainiert)
      if (log.exerciseId !== state.exerciseId) {
        const keep = state;
        def = ExerciseDatabase.require(log.exerciseId);
        state = { ...freshState(def, log.planned), setbacks: keep.setbacks, conservativeLevel: keep.conservativeLevel, successfulProgressions: keep.successfulProgressions, efficientMode: keep.efficientMode, lastPerformed: keep.lastPerformed };
      }

      // Längere Pause → Reduktion vor der Bewertung
      if (state.lastPerformed) {
        const gap = daysBetween(state.lastPerformed, ev.date);
        if (gap >= PROGRESSION_CONFIG.gapReduceDays) {
          const from = { ...state.current };
          const steps = gap >= PROGRESSION_CONFIG.gapStrongReduceDays ? 2 : 1;
          const r = regressPrescription(def, state.current, steps);
          state.current = r.to;
          state.toleratedAtLevel = 0;
          state.sessionsAtLevel = 0;
          state.status = 'Learning';
          record(ev.date, 'deload', from, ['trainingGap'], { changedVariable: r.variable, context: { gapDays: gap } });
        }
      }

      state.totalSessions++;
      state.sessionsAtLevel++;
      state.lastPerformed = ev.date;
      const from = { ...state.current };
      const strengthLoss = completion < PROGRESSION_CONFIG.strengthLossRatio;
      const load = computeExerciseLoad(def, log.actual);
      const base: Partial<DecisionRecord> = { sessionId: ev.sessionId, score, recovery, load };
      const justProgressed = state.successfulProgressions > 0 && (state.lastDecision?.type === 'progress' || state.lastDecision?.type === 'variantChange') && state.sessionsAtLevel <= 2;
      const setback = () => {
        if (justProgressed) {
          state.setbacks++;
          state.efficientMode = false;
          if (state.lastProgressionVariable) variableSetbacks.set(state.lastProgressionVariable, (variableSetbacks.get(state.lastProgressionVariable) ?? 0) + 1);
          state.conservativeLevel = Math.min(PROGRESSION_CONFIG.maxConservativeLevel, state.setbacks >= 3 ? 2 : state.setbacks >= 2 ? 1 : 0);
          return true;
        }
        return false;
      };

      if (recovery.status === 'red') {
        state.paused = true;
        pausedBy = 'warning';
        state.status = 'Paused';
        state.toleratedAtLevel = 0;
        record(ev.date, 'stop', from, recovery.warnings.length ? ['warningSymptom', 'recoveryRed'] : ['recoveryRed'], base);
        continue;
      }

      if (state.paused) {
        state.status = 'Paused';
        record(ev.date, 'hold', from, [pausedBy === 'warning' ? 'warningSymptom' : 'manualPause'], base);
        continue;
      }

      if (recovery.status === 'orange') {
        const sb = setback();
        const r = regressPrescription(def, state.current, 1);
        state.current = r.to;
        state.toleratedAtLevel = 0;
        state.sessionsAtLevel = 0;
        state.lastLevelChange = ev.date;
        state.status = 'RegressionRequired';
        const reasons: ReasonCode[] = ['recoveryOrange', ...recovery.flags.filter((f) => ['swelling', 'gaitAltered', 'painIncrease', 'mobilityWorse'].includes(f))];
        if (sb) reasons.push('setbackAfterProgression');
        if (state.conservativeLevel > 0) reasons.push('conservativeMode');
        record(ev.date, 'regress', from, reasons, { ...base, changedVariable: r.variable });
        continue;
      }

      if (recovery.status === 'yellow') {
        const sb = setback();
        state.toleratedAtLevel = 0;
        state.status = 'Stable';
        const reasons: ReasonCode[] = ['recoveryYellow', ...recovery.flags.filter((f) => ['swelling', 'gaitAltered', 'painIncrease'].includes(f))];
        if (sb) reasons.push('setbackAfterProgression');
        if (state.conservativeLevel > 0) reasons.push('conservativeMode');
        record(ev.date, 'hold', from, reasons, base);
        continue;
      }

      // ---- green
      const reasons: ReasonCode[] = [];
      if (!recovery.hasFollowUp) {
        reasons.push('followUpMissing');
      } else if (strengthLoss) {
        state.toleratedAtLevel = 0;
        reasons.push('strengthLoss');
      } else if (score.band === 'progress') {
        state.toleratedAtLevel++;
        state.toleratedTotal++;
      } else if (score.band === 'maintain') {
        reasons.push('scoreMaintain');
      } else {
        state.toleratedAtLevel = 0;
        reasons.push(score.band === 'review' ? 'scoreReview' : 'scoreLow');
        if (score.missing.length) reasons.push('missingData');
      }

      const req = requiredTolerated(state);
      if (reasons.length === 0 && state.toleratedAtLevel >= req) {
        const regionStatus = LoadManagementEngine.exerciseRegionStatus(ctx.daily, ev.date, def);
        const global = SafetyGateEngine.global({ ...ctx, sessions: ctx.completed, date: ev.date });
        const skip = new Set([...variableSetbacks].filter(([, n]) => n >= 2).map(([v]) => v));
        const step = nextProgressionStep(def, state.current, { conservative: state.conservativeLevel > 0, skip });
        const gateFor = (target: ExerciseDefinition) =>
          SafetyGateEngine.checkProgression({ profile: ctx.profile, target, recovery, score, regionStatus, global, strengthLoss });

        if (step) {
          const gate = gateFor(def);
          if (gate.allowed) {
            state.current = step.to;
            state.ladderIndex = step.index;
            const tol = state.toleratedAtLevel;
            state.toleratedAtLevel = 0;
            state.sessionsAtLevel = 0;
            state.successfulProgressions++;
            state.lastProgressionVariable = step.variable;
            state.lastLevelChange = ev.date;
            if (state.successfulProgressions >= PROGRESSION_CONFIG.efficientAfterProgressions && state.setbacks === 0) state.efficientMode = true;
            state.status = 'ProgressionApproved';
            const rs: ReasonCode[] = ['toleratedSessions', 'followUpUnremarkable', 'scoreHigh', 'singleVariable'];
            if (state.conservativeLevel > 0) rs.push('conservativeMode');
            if (state.efficientMode) rs.push('efficientMode');
            if (skip.size) rs.push('stagnation');
            record(ev.date, 'progress', from, rs, { ...base, changedVariable: step.variable, context: { tolerated: tol, required: req } });
            if (JSON.stringify(state.current) !== JSON.stringify(state.peak)) state.peak = { ...state.current };
          } else {
            state.status = 'ProgressionCandidate';
            record(ev.date, 'hold', from, ['toleratedSessions', ...gate.reasons], { ...base, context: { ...gate.context, tolerated: state.toleratedAtLevel } });
          }
          continue;
        }

        // Pfad ausgeschöpft → Variantenwechsel prüfen
        const next = ExerciseDatabase.nextVariant(def.id);
        if (next) {
          const av = availability(next, ctx, ev.date);
          const gate = gateFor(next);
          if (av.available && gate.allowed) {
            const prevId = def.id;
            const keep = state;
            def = next;
            state = {
              ...freshState(def, def.defaultPrescription),
              setbacks: keep.setbacks,
              conservativeLevel: keep.conservativeLevel,
              successfulProgressions: keep.successfulProgressions + 1,
              efficientMode: keep.efficientMode,
              lastPerformed: keep.lastPerformed,
              lastLevelChange: ev.date,
              totalSessions: 0,
              status: 'ProgressionApproved',
              lastProgressionVariable: 'difficulty'
            };
            record(ev.date, 'variantChange', from, ['toleratedSessions', 'ladderMaxed', 'followUpUnremarkable'], {
              ...base,
              fromExerciseId: prevId,
              toExerciseId: next.id,
              changedVariable: next.singleLeg && !ExerciseDatabase.require(prevId).singleLeg ? 'singleLeg' : 'difficulty'
            });
            // Entscheidung gehört zur neuen Übung
            state.lastDecision!.exerciseId = next.id;
            state.lastDecision!.explanation = DecisionExplanationEngine.explain(state.lastDecision!);
            continue;
          }
          state.status = 'Stable';
          const rs: ReasonCode[] = ['ladderMaxed'];
          const context: DecisionRecord['context'] = {};
          if (av.missingClearances.length) {
            rs.push('missingClearance');
            context.clearances = MedicalRestrictionsEngine.describeMissing(av.missingClearances);
          }
          if (av.missingPrerequisites.length) {
            rs.push('missingPrerequisite');
            context.prerequisite = av.missingPrerequisites.map((m) => m.label).join('; ');
          }
          rs.push(...gate.reasons.filter((r) => r !== 'missingClearance'));
          record(ev.date, 'hold', from, rs, { ...base, context });
          continue;
        }
        state.status = 'Stable';
        record(ev.date, 'hold', from, ['ladderMaxed'], base);
        continue;
      }

      // Halten
      if (!reasons.length) reasons.push('notEnoughTolerated');
      if (state.sessionsAtLevel >= PROGRESSION_CONFIG.stagnationSessions) reasons.push('stagnation');
      if (state.conservativeLevel > 0) reasons.push('conservativeMode');
      state.status = state.totalSessions < 2 ? 'Learning' : state.toleratedAtLevel >= req - 1 && recovery.hasFollowUp ? 'ProgressionCandidate' : 'Stable';
      record(ev.date, 'hold', from, reasons, base);
    }

    // Freigabe nachträglich entzogen?
    if (!MedicalRestrictionsEngine.canPerform(ctx.profile, def)) state.status = 'Locked';
    return { family, state, decisions, untouched: !touched };
  },

  /**
   * Vorgabe für ein bestimmtes Datum (z. B. heute) – berücksichtigt Trainingspausen,
   * ohne den Zustand zu verändern.
   */
  plannedPrescription(def: ExerciseDefinition, state: ExerciseState, date: ISODate): { prescription: Prescription; gapDays?: number; reduced: boolean } {
    if (!state.lastPerformed) return { prescription: state.current, reduced: false };
    const gap = daysBetween(state.lastPerformed, date);
    if (gap >= PROGRESSION_CONFIG.gapReduceDays) {
      const steps = gap >= PROGRESSION_CONFIG.gapStrongReduceDays ? 2 : 1;
      return { prescription: regressPrescription(def, state.current, steps).to, gapDays: gap, reduced: true };
    }
    return { prescription: state.current, reduced: false };
  }
};

export type { ScoreBreakdown, RecoveryAssessment, ExerciseStatus };
