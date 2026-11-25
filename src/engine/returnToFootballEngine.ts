/**
 * Return-to-Football-Modul
 *
 * Zwölf Phasen mit eigenen Eintrittsvoraussetzungen. Keine Phase wird
 * anhand des Kalenders freigeschaltet. Ab Phase 10 ist zusätzlich eine
 * ausdrückliche Bestätigung (Arzt/Physiotherapie) nötig.
 */
import type { ClearanceKey, ExerciseState } from '../domain/types';
import { latestTest, type EngineContext } from './context';
import { MedicalRestrictionsEngine, CLEARANCE_LABEL } from './medicalRestrictionsEngine';
import type { RunningState } from './runningProgressionEngine';
import type { ReadinessResult } from './functionalReadinessEngine';

export interface FootballCriterion {
  label: string;
  met: boolean;
}

export interface FootballPhase {
  phase: number;
  name: string;
  description: string;
  criteria: FootballCriterion[];
  unlocked: boolean;
  exerciseIds: string[];
}

export const PHASE_NAMES = [
  'Grundkraft',
  'Kontinuierliches Joggen',
  'Beschleunigung',
  'Abbremsen',
  'Richtungswechsel',
  'Sprungtraining',
  'Einbeinige Sprünge',
  'Sportartspezifische Belastung',
  'Balltraining',
  'Kontrolliertes Mannschaftstraining',
  'Vollständiges Training',
  'Wettkampfbelastung'
];

const PHASE_DESC = [
  'Kraftaufbau von Wade, Oberschenkel und Hüfte als Basis.',
  'Durchgehendes Joggen ohne Gehpausen.',
  'Submaximale Steigerungsläufe über kurze Distanzen.',
  'Kontrolliertes Abstoppen aus dem Lauf.',
  'Geplante Richtungswechsel 45° → 90°.',
  'Beidbeinige Sprünge mit kontrollierter Landung.',
  'Einbeinige Sprünge und Landungen.',
  'Fußballtypische Bewegungsmuster ohne Ball.',
  'Technik mit Ball in kontrolliertem Tempo.',
  'Ausgewählte Trainingsteile ohne Zweikämpfe – nach Absprache.',
  'Uneingeschränkte Trainingsteilnahme – nach Freigabe.',
  'Spielbelastung – nach Freigabe.'
];

export const ReturnToFootballEngine = {
  evaluate(ctx: EngineContext, running: RunningState, _families: Map<string, ExerciseState>, readiness: ReadinessResult[]): { currentPhase: number; phases: FootballPhase[] } {
    const cleared = (k: ClearanceKey): FootballCriterion => ({ label: `Freigabe ${CLEARANCE_LABEL[k]}`, met: MedicalRestrictionsEngine.isCleared(ctx.profile, k) });
    const tolTotal = (id: string, n: number, label: string): FootballCriterion => ({ label, met: (ctx.tolerated.get(id) ?? []).length >= n });
    const test = (k: Parameters<typeof latestTest>[1], min: number, label: string): FootballCriterion => {
      const t = latestTest(ctx.tests, k, ctx.today);
      return { label, met: !!t && t.value >= min };
    };
    const confirmed = (phase: number): FootballCriterion => ({
      label: 'Bestätigung durch Arzt/Physiotherapie dokumentiert',
      met: ctx.adjustments.some((a) => a.action === 'footballPhaseConfirmed' && (a.value ?? 0) >= phase)
    });
    const readinessMet = (cat: ReadinessResult['category']) => readiness.find((r) => r.category === cat)?.criteriaMet ?? false;

    const criteria: FootballCriterion[][] = [
      [cleared('fullWeightBearing'), cleared('strengthTraining')],
      [cleared('jogging'), { label: 'Laufstufe I (15 min kontinuierlich) erreicht', met: running.stageIndex >= 8 }],
      [
        { label: 'Laufstufe K (30 min) gut vertragen', met: running.stageIndex >= 10 && running.toleratedAtStage >= 2 },
        test('singleLegCalfRaiseAffected', 20, 'Einbeinige Wadenheber ≥ 20 Wdh. (Funktionstest)')
      ],
      [tolTotal('acceleration_runs', 3, 'Beschleunigungsläufe 3 × gut vertragen')],
      [tolTotal('deceleration_drills', 3, 'Abbremsen 3 × gut vertragen')],
      [cleared('jumping'), tolTotal('change_of_direction', 3, 'Richtungswechsel 3 × gut vertragen'), { label: 'Bereitschaft Sprungtraining (Kriterien erfüllt)', met: readinessMet('jumping') }],
      [cleared('singleLeg'), tolTotal('pogo_jumps', 3, 'Beidbeinige Sprünge 3 × gut vertragen'), test('singleLegStandAffected', 30, 'Einbeinstand ≥ 30 s (Funktionstest)')],
      [cleared('football'), tolTotal('single_leg_hops', 3, 'Einbeinige Sprünge 3 × gut vertragen'), { label: 'Bereitschaft Fußball (Kriterien erfüllt)', met: readinessMet('football') }],
      [tolTotal('football_movements', 3, 'Fußballbewegungen 3 × gut vertragen')],
      [tolTotal('ball_training', 3, 'Balltraining 3 × gut vertragen'), confirmed(10)],
      [tolTotal('team_training_controlled', 3, 'Kontrolliertes Mannschaftstraining 3 × gut vertragen'), confirmed(11)],
      [confirmed(12)]
    ];

    const exercisesByPhase = new Map<number, string[]>([
      [3, ['acceleration_runs']],
      [4, ['deceleration_drills']],
      [5, ['change_of_direction']],
      [6, ['pogo_jumps']],
      [7, ['single_leg_hops']],
      [8, ['football_movements']],
      [9, ['ball_training']],
      [10, ['team_training_controlled']]
    ]);

    let currentPhase = 0;
    let chainOk = true;
    const phases: FootballPhase[] = criteria.map((c, i) => {
      const phase = i + 1;
      const unlocked = chainOk && c.every((x) => x.met);
      if (unlocked) currentPhase = phase;
      else chainOk = false;
      return { phase, name: PHASE_NAMES[i], description: PHASE_DESC[i], criteria: c, unlocked, exerciseIds: exercisesByPhase.get(phase) ?? [] };
    });
    return { currentPhase, phases };
  }
};
