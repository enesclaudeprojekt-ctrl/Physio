import { describe, expect, it } from 'vitest';
import { followUp, profileWith, run, session, START, test_ } from './helpers';
import { addDays } from '../src/utils/date';
import { RUN_STAGES, stagePrescription } from '../src/engine/runningProgressionEngine';
import type { FollowUpCheck, TrainingSession } from '../src/domain/types';

const runProfile = () => profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises', 'singleLeg', 'jogging']);
const readyTests = [test_('singleLegCalfRaiseAffected', 18, START), test_('singleLegStandAffected', 40, START), test_('painFreeWalkingMin', 40, START)];

function walkHistory(): { sessions: TrainingSession[]; fus: FollowUpCheck[] } {
  const sessions: TrainingSession[] = [];
  const fus: FollowUpCheck[] = [];
  for (let i = 0; i < 6; i += 2) {
    const s = session(addDays(START, i), [{ exerciseId: 'walking', planned: { durationSec: 2100, speedKmh: 4.5 } }]);
    sessions.push(s);
    fus.push(followUp(s));
  }
  return { sessions, fus };
}

describe('RunningProgressionEngine', () => {
  it('Laufbeginn nur mit Freigabe UND erfüllten funktionellen Kriterien', () => {
    const { sessions, fus } = walkHistory();
    const ev = run(runProfile(), sessions, fus, addDays(START, 7), { tests: readyTests });
    expect(ev.readiness.find((r) => r.category === 'runStart')!.criteriaMet).toBe(true);
    expect(ev.runningPlan.status).toBe('run');
    expect(ev.runningPlan.prescription!.stage).toBe('A');
    expect(ev.plan.items.some((i) => i.block === 'running')).toBe(true);
  });

  it('Progression erst nach zwei verträglichen Einheiten auf derselben Stufe', () => {
    const { sessions, fus } = walkHistory();
    const p = runProfile();
    const r1 = session(addDays(START, 8), [{ exerciseId: 'run_walk_intervals', planned: stagePrescription(0).prescription }]);
    let ev = run(p, [...sessions, r1], [...fus, followUp(r1)], addDays(START, 10), { tests: readyTests });
    expect(ev.running.stageIndex).toBe(0);
    const r2 = session(addDays(START, 10), [{ exerciseId: 'run_walk_intervals', planned: stagePrescription(0).prescription }]);
    ev = run(p, [...sessions, r1, r2], [...fus, followUp(r1), followUp(r2)], addDays(START, 12), { tests: readyTests });
    expect(ev.running.stageIndex).toBe(1);
    expect(ev.running.decisions.at(-1)!.explanation).toMatch(/Laufstufe A → B/);
  });

  it('Ruhetag zwischen Laufeinheiten', () => {
    const { sessions, fus } = walkHistory();
    const r1 = session(addDays(START, 8), [{ exerciseId: 'run_walk_intervals', planned: stagePrescription(0).prescription }]);
    const ev = run(runProfile(), [...sessions, r1], [...fus, followUp(r1)], addDays(START, 9), { tests: readyTests });
    expect(ev.runningPlan.status).toBe('restDay');
  });

  it('Schmerz beim Laufen ≥ 3 → Stufe wird reduziert', () => {
    const { sessions, fus } = walkHistory();
    const r1 = session(addDays(START, 8), [{ exerciseId: 'run_walk_intervals', planned: stagePrescription(3).prescription, painDuring: 4 }], { painAfter: 3 });
    const ev = run(runProfile(), [...sessions, r1], [...fus, followUp(r1, { pain: 2 })], addDays(START, 10), { tests: readyTests });
    expect(ev.running.stageIndex).toBe(2);
    expect(ev.running.decisions.at(-1)!.type).toBe('regress');
  });

  it('Stufen A–K sind vollständig definiert', () => {
    expect(RUN_STAGES.map((s) => s.id).join('')).toBe('ABCDEFGHIJK');
    expect(stagePrescription(10).exerciseId).toBe('continuous_jog');
  });

  it('Schienbeinschmerz wiederholt → kein Laufbeginn', () => {
    const { sessions, fus } = walkHistory();
    fus[1].painLocations = ['shin'];
    fus[2].painLocations = ['shin'];
    const ev = run(runProfile(), sessions, fus, addDays(START, 7), { tests: readyTests });
    expect(ev.readiness.find((r) => r.category === 'runStart')!.criteriaMet).toBe(false);
    expect(ev.runningPlan.status).toBe('notReady');
  });
});

describe('Return to Football', () => {
  it('ohne Fortschritte nur Phase 1 (Grundkraft) entsperrt – kalenderunabhängig', () => {
    const ev = run(profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises', 'jogging', 'jumping', 'football', 'singleLeg']), [], [], '2027-12-31');
    expect(ev.football.currentPhase).toBe(1);
    expect(ev.football.phases.filter((p) => p.unlocked)).toHaveLength(1);
  });
});
