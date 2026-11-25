/**
 * FunctionalReadinessEngine
 *
 * Funktionelles Bereitschaftsprofil als ENTSCHEIDUNGSHILFE. Ein erfülltes
 * Kriterienset schaltet niemals allein eine neue sportliche Phase frei –
 * die medizinische Freigabe ist immer zusätzlich erforderlich.
 * Fehlende Daten gelten als „nicht erfüllt“.
 */
import type { ClearanceKey, FunctionalTestKey, GaitPattern, ISODate } from '../domain/types';
import { READINESS_CONFIG } from './config';
import { latestTest, type EngineContext } from './context';
import { MedicalRestrictionsEngine, CLEARANCE_LABEL } from './medicalRestrictionsEngine';
import { SafetyGateEngine } from './safetyGateEngine';
import { RUN_STAGES, type RunningState } from './runningProgressionEngine';
import { addDays } from '../utils/date';

export type ReadinessCategory =
  | 'everyday'
  | 'strength'
  | 'longWalking'
  | 'briskWalking'
  | 'runStart'
  | 'continuousJog'
  | 'jumping'
  | 'changeOfDirection'
  | 'football';

export const READINESS_LABEL: Record<ReadinessCategory, string> = {
  everyday: 'Alltag',
  strength: 'Krafttraining',
  longWalking: 'Längeres Gehen',
  briskWalking: 'Zügiges Gehen',
  runStart: 'Laufbeginn',
  continuousJog: 'Kontinuierliches Joggen',
  jumping: 'Sprungtraining',
  changeOfDirection: 'Richtungswechsel',
  football: 'Fußball'
};

export interface Criterion {
  label: string;
  /** null = keine Daten → gilt als nicht erfüllt */
  met: boolean | null;
  value?: string;
  isClearance?: boolean;
}

export interface ReadinessResult {
  category: ReadinessCategory;
  label: string;
  status: 'locked' | 'notReady' | 'criteriaMet';
  criteria: Criterion[];
  /** Alle Kriterien inklusive Freigabe erfüllt */
  criteriaMet: boolean;
  missing: string[];
}

export interface FunctionalMetrics {
  walkingMinTolerated: number | null;
  briskWalkingMinTolerated: number | null;
  lastGait: GaitPattern | null;
  gaitNormalRecent: boolean | null;
  bilateralCalfRepsTolerated: number | null;
  singleLegCalfRaise: number | null;
  singleLegCalfRaiseHealthy: number | null;
  calfSymmetryPct: number | null;
  singleLegStandSec: number | null;
  kneeToWallCm: number | null;
  ankleMobility: string | null;
  qualityControlledShare: number | null;
  recoveryGreenShare7d: number | null;
  recentSwelling: boolean | null;
  latestPain: number | null;
  hopSymmetryPct: number | null;
}

function maxOf(nums: (number | undefined)[]): number | null {
  const v = nums.filter((n): n is number => typeof n === 'number');
  return v.length ? Math.max(...v) : null;
}

export const FunctionalReadinessEngine = {
  metrics(ctx: EngineContext, date: ISODate = ctx.today): FunctionalMetrics {
    const since = addDays(date, -28);
    const tol = (id: string) => (ctx.tolerated.get(id) ?? []).filter((t) => t.date >= since && t.date <= date);
    const test = (k: FunctionalTestKey) => latestTest(ctx.tests, k, date)?.value ?? null;

    const walkTol = [...tol('walking'), ...tol('brisk_walking')].map((t) => (t.prescription.durationSec ?? 0) / 60);
    const walkingFromLogs = maxOf(walkTol);
    const walkTest = test('painFreeWalkingMin');
    const walkingMinTolerated = maxOf([walkingFromLogs ?? undefined, walkTest ?? undefined]);
    const briskWalkingMinTolerated = maxOf(tol('brisk_walking').map((t) => (t.prescription.durationSec ?? 0) / 60));

    const gaitEntries = [
      ...ctx.completed.filter((s) => s.date <= date && s.gait && s.gait !== 'notAssessable').map((s) => ({ d: s.date, g: s.gait! })),
      ...ctx.followUps.filter((f) => f.date <= date && f.gait !== 'notAssessable').map((f) => ({ d: f.date, g: f.gait }))
    ].sort((a, b) => (a.d < b.d ? 1 : -1));
    const lastGait = gaitEntries[0]?.g ?? null;
    const gaitNormalRecent = gaitEntries.length ? gaitEntries.slice(0, 3).every((e) => e.g === 'normal') : null;

    const calfIds = ['bilateral_calf_raise', 'step_calf_raise', 'weighted_calf_raise'];
    const bilateralCalfRepsTolerated = maxOf([...calfIds.flatMap((id) => tol(id).map((t) => t.prescription.reps)), test('bilateralCalfRaise') ?? undefined]);
    const slTol = maxOf(tol('single_leg_calf_raise').map((t) => t.prescription.reps));
    const singleLegCalfRaise = maxOf([test('singleLegCalfRaiseAffected') ?? undefined, slTol ?? undefined]);
    const singleLegCalfRaiseHealthy = test('singleLegCalfRaiseHealthy');
    const calfSymmetryPct = singleLegCalfRaise !== null && singleLegCalfRaiseHealthy ? Math.round((singleLegCalfRaise / singleLegCalfRaiseHealthy) * 100) : null;

    const slsTol = maxOf(['single_leg_stand', 'single_leg_stand_unstable'].flatMap((id) => tol(id).map((t) => t.prescription.durationSec)));
    const singleLegStandSec = maxOf([test('singleLegStandAffected') ?? undefined, slsTol ?? undefined, ctx.profile.baseline.singleLegStandSeconds ?? undefined]);
    const kneeToWallCm = test('kneeToWallAffectedCm');

    const recentLogs = [...ctx.evaluations.values()].filter((e) => e.session.date <= date && e.session.date >= addDays(date, -14));
    const withQ = recentLogs.filter((e) => e.log.movementQuality);
    const qualityControlledShare = withQ.length ? withQ.filter((e) => e.log.movementQuality === 'controlled').length / withQ.length : null;

    const last7 = ctx.completed.filter((s) => s.date <= date && s.date >= addDays(date, -7));
    const last7Eval = recentLogs.filter((e) => e.session.date >= addDays(date, -7));
    const recoveryGreenShare7d = last7Eval.length ? last7Eval.filter((e) => e.recovery.status === 'green').length / last7Eval.length : null;
    const fu7 = ctx.followUps.filter((f) => f.date <= date && f.date >= addDays(date, -7));
    const swVals = [...last7.map((s) => s.swelling), ...fu7.map((f) => f.swelling)].filter((x) => x !== undefined);
    const recentSwelling = swVals.length ? swVals.some((x) => (x ?? 0) >= 1) : null;
    const painEntries = [
      ...ctx.followUps.filter((f) => f.date <= date).map((f) => ({ d: f.date, p: f.pain })),
      ...ctx.completed.filter((s) => s.date <= date && s.painAfter !== undefined).map((s) => ({ d: s.date, p: s.painAfter! }))
    ].sort((a, b) => (a.d < b.d ? 1 : -1));
    const latestPain = painEntries[0]?.p ?? ctx.profile.baseline.painLevel ?? null;

    const hopA = test('hopTestAffectedCm');
    const hopH = test('hopTestHealthyCm');
    const hopSymmetryPct = hopA !== null && hopH ? Math.round((hopA / hopH) * 100) : null;

    return {
      walkingMinTolerated,
      briskWalkingMinTolerated,
      lastGait,
      gaitNormalRecent,
      bilateralCalfRepsTolerated,
      singleLegCalfRaise,
      singleLegCalfRaiseHealthy,
      calfSymmetryPct,
      singleLegStandSec,
      kneeToWallCm,
      ankleMobility: ctx.profile.baseline.ankleMobility,
      qualityControlledShare,
      recoveryGreenShare7d,
      recentSwelling,
      latestPain,
      hopSymmetryPct
    };
  },

  evaluate(ctx: EngineContext, running: RunningState, date: ISODate = ctx.today): { metrics: FunctionalMetrics; categories: ReadinessResult[] } {
    const m = FunctionalReadinessEngine.metrics(ctx, date);
    const C = READINESS_CONFIG;
    const shin = SafetyGateEngine.recurringShinPain(ctx.completed, ctx.followUps, date);
    const clearance = (k: ClearanceKey): Criterion => ({ label: `Freigabe ${CLEARANCE_LABEL[k]} dokumentiert`, met: MedicalRestrictionsEngine.isCleared(ctx.profile, k), isClearance: true });
    const num = (label: string, v: number | null, min: number, unit: string): Criterion => ({ label, met: v === null ? null : v >= min, value: v === null ? 'keine Daten' : `${Math.round(v * 10) / 10} ${unit}` });
    const bool = (label: string, v: boolean | null, value?: string): Criterion => ({ label, met: v, value: v === null ? 'keine Daten' : value });
    const stageTol = (minIdx: number) => running.stageIndex > minIdx || (running.stageIndex === minIdx && running.toleratedAtStage >= 2);

    const gaitOk = bool('Normales Gangbild (letzte Einträge)', m.gaitNormalRecent);
    const noSwelling = bool('Keine Schwellung in den letzten 7 Tagen', m.recentSwelling === null ? null : !m.recentSwelling);
    const lowPain = num('Schmerz aktuell ≤ 2/10', m.latestPain === null ? null : 10 - m.latestPain, 8, '').met === null ? { label: 'Schmerz aktuell ≤ 2/10', met: null, value: 'keine Daten' } : { label: 'Schmerz aktuell ≤ 2/10', met: (m.latestPain ?? 10) <= 2, value: `${m.latestPain}/10` };
    const recoveryOk = bool('Belastungsreaktion der letzten 7 Tage überwiegend unauffällig', m.recoveryGreenShare7d === null ? null : m.recoveryGreenShare7d >= 0.8, m.recoveryGreenShare7d === null ? undefined : `${Math.round(m.recoveryGreenShare7d * 100)} % grün`);
    const noShin: Criterion = { label: 'Keine wiederkehrenden Schienbeinschmerzen', met: !shin };

    const defs: Record<ReadinessCategory, Criterion[]> = {
      everyday: [clearance('fullWeightBearing'), gaitOk, lowPain],
      strength: [clearance('strengthTraining'), recoveryOk],
      longWalking: [clearance('fullWeightBearing'), num(`Gehen ≥ ${C.walkingLongMin} min gut vertragen`, m.walkingMinTolerated, C.walkingLongMin, 'min'), gaitOk],
      briskWalking: [clearance('fullWeightBearing'), num(`Gehen ≥ ${C.briskWalkingMin} min gut vertragen`, m.walkingMinTolerated, C.briskWalkingMin, 'min'), gaitOk, lowPain],
      runStart: [
        clearance('jogging'),
        num(`Gehen ≥ ${C.runStartWalkingMin} min gut vertragen`, m.walkingMinTolerated, C.runStartWalkingMin, 'min'),
        gaitOk,
        num(`Einbeinige Wadenheber betroffen ≥ ${C.runStartSingleLegCalfRaises} Wdh.`, m.singleLegCalfRaise, C.runStartSingleLegCalfRaises, 'Wdh.'),
        num(`Einbeinstand betroffen ≥ ${C.runStartSingleLegStandSec} s`, m.singleLegStandSec, C.runStartSingleLegStandSec, 's'),
        noSwelling,
        recoveryOk,
        noShin
      ],
      continuousJog: [
        clearance('jogging'),
        { label: 'Laufstufe H (10 min / 1 min) gut vertragen', met: stageTol(7), value: `aktuell Stufe ${RUN_STAGES[running.stageIndex].id}` },
        num(`Einbeinige Wadenheber ≥ ${C.continuousJogSingleLegCalfRaises} Wdh.`, m.singleLegCalfRaise, C.continuousJogSingleLegCalfRaises, 'Wdh.'),
        noShin
      ],
      jumping: [
        clearance('jumping'),
        { label: 'Kontinuierliches Joggen 20 min gut vertragen', met: stageTol(9), value: `aktuell Stufe ${RUN_STAGES[running.stageIndex].id}` },
        num(`Einbeinige Wadenheber ≥ ${C.jumpingSingleLegCalfRaises} Wdh.`, m.singleLegCalfRaise, C.jumpingSingleLegCalfRaises, 'Wdh.'),
        num(`Wadenkraft-Seitenvergleich ≥ ${C.calfSymmetryPct} %`, m.calfSymmetryPct, C.calfSymmetryPct, '%'),
        noShin
      ],
      changeOfDirection: [
        clearance('jogging'),
        { label: 'Kontinuierliches Joggen 30 min gut vertragen', met: stageTol(10), value: `aktuell Stufe ${RUN_STAGES[running.stageIndex].id}` },
        num('Einbeinstand betroffen ≥ 30 s', m.singleLegStandSec, 30, 's'),
        num(`Einbeinige Wadenheber ≥ ${C.continuousJogSingleLegCalfRaises} Wdh.`, m.singleLegCalfRaise, C.continuousJogSingleLegCalfRaises, 'Wdh.')
      ],
      football: [
        clearance('football'),
        clearance('jumping'),
        { label: 'Kontinuierliches Joggen 30 min gut vertragen', met: stageTol(10) },
        num(`Sprungtest-Seitenvergleich ≥ ${C.hopSymmetryPct} %`, m.hopSymmetryPct, C.hopSymmetryPct, '%'),
        num(`Wadenkraft-Seitenvergleich ≥ ${C.calfSymmetryPct} %`, m.calfSymmetryPct, C.calfSymmetryPct, '%')
      ]
    };

    const categories = (Object.keys(defs) as ReadinessCategory[]).map((category) => {
      const criteria = defs[category];
      const clearanceMissing = criteria.some((c) => c.isClearance && !c.met);
      const criteriaMet = criteria.every((c) => c.met === true);
      return {
        category,
        label: READINESS_LABEL[category],
        criteria,
        criteriaMet,
        status: clearanceMissing ? 'locked' : criteriaMet ? 'criteriaMet' : 'notReady',
        missing: criteria.filter((c) => c.met !== true).map((c) => c.label)
      } satisfies ReadinessResult;
    });
    return { metrics: m, categories };
  }
};
