import { describe, expect, it } from 'vitest';
import { followUp, profileWith, run, session, START, test_, ctxOf } from './helpers';
import { addDays } from '../src/utils/date';
import { RecoveryAssessmentEngine } from '../src/engine/recoveryAssessmentEngine';
import { computeProgressionScore } from '../src/engine/progressionScore';
import { SafetyGateEngine } from '../src/engine/safetyGateEngine';
import { LoadManagementEngine, computeExerciseLoad } from '../src/engine/loadManagementEngine';
import { ExerciseDatabase } from '../src/engine/exerciseDatabase';
import { nextProgressionStep } from '../src/engine/exerciseProgressionEngine';
import { MedicalRestrictionsEngine } from '../src/engine/medicalRestrictionsEngine';
import type { Prescription, TrainingSession, FollowUpCheck } from '../src/domain/types';

const CALF10: Prescription = { sets: 3, reps: 10, restSec: 60, tempo: 'normal' };
const calfLog = (planned: Prescription = CALF10, extra: Partial<{ painDuring: number; quality: 'controlled' | 'painful' | 'clearlyLimited'; actual: Prescription }> = {}) => ({ exerciseId: 'bilateral_calf_raise', planned, ...extra });

/** Serie gut vertragener Einheiten, die jeweils die aktuelle Vorgabe der Engine übernehmen. */
function goodSeries(count: number, exerciseFamily = 'calf_raise', startDate = START, profile = profileWith()) {
  const sessions: TrainingSession[] = [];
  const fus: FollowUpCheck[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(startDate, i * 2);
    const ev = run(profile, sessions, fus, date);
    const item = ev.plan.items.find((it) => it.family === exerciseFamily) ?? ev.plan.items.find((it) => it.block === 'calf')!;
    const s = session(date, [{ exerciseId: item.exerciseId, planned: item.prescription }]);
    sessions.push(s);
    fus.push(followUp(s));
  }
  return { sessions, fus, profile, ev: run(profile, sessions, fus, addDays(startDate, count * 2)) };
}

function changedKeys(a: Prescription, b: Prescription): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => (a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]);
}

describe('1 – Gute Belastungsreaktion', () => {
  it('liefert Grün und hohen Score', () => {
    const s = session(START, [calfLog()]);
    const a = RecoveryAssessmentEngine.assess({ session: s, log: s.exercises[0], followUp: followUp(s) });
    expect(a.status).toBe('green');
    expect(a.flags).toContain('followUpUnremarkable');
    const sc = computeProgressionScore(s, s.exercises[0], followUp(s));
    expect(sc.total).toBe(100);
    expect(sc.band).toBe('progress');
  });
});

describe('2 – Leichte Beschwerden', () => {
  it('moderater Schmerz → Gelb, keine Progression', () => {
    const s = session(START, [calfLog(CALF10, { painDuring: 3 })], { painAfter: 3 });
    const a = RecoveryAssessmentEngine.assess({ session: s, log: s.exercises[0], followUp: followUp(s, { pain: 1 }) });
    expect(a.status).toBe('yellow');
  });
  it('hohe Ermüdung → Gelb', () => {
    const s = session(START, [calfLog()], { fatigue: 8 });
    s.exercises[0].rpe = 8;
    expect(RecoveryAssessmentEngine.assess({ session: s, log: s.exercises[0], followUp: followUp(s) }).status).toBe('yellow');
  });
});

describe('3 – Schwellung am Folgetag', () => {
  it('deutliche Schwellung → Orange und Regression der zuletzt gesteigerten Variable', () => {
    const { sessions, fus, profile } = goodSeries(3);
    const date = addDays(START, 6);
    const ev0 = run(profile, sessions, fus, date);
    expect(ev0.familyStates.get('calf_raise')!.current.reps).toBe(12);
    const s = session(date, [calfLog({ ...CALF10, reps: 12 })]);
    const ev = run(profile, [...sessions, s], [...fus, followUp(s, { swelling: 2 })], addDays(date, 1));
    const dec = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(dec.recovery!.status).toBe('orange');
    expect(dec.type).toBe('regress');
    expect(ev.familyStates.get('calf_raise')!.current.reps).toBe(10);
    expect(ev.plan.kind).toBe('recovery');
  });
});

describe('4 – Verändertes Gangbild', () => {
  it('leicht verändert → Gelb; deutlich verändert → Orange', () => {
    const s1 = session(START, [calfLog()], { gait: 'slightlyAltered' });
    expect(RecoveryAssessmentEngine.assess({ session: s1, followUp: followUp(s1) }).status).toBe('yellow');
    const s2 = session(START, [calfLog()]);
    const a = RecoveryAssessmentEngine.assess({ session: s2, followUp: followUp(s2, { gait: 'clearlyAltered' }) });
    expect(a.status).toBe('orange');
    expect(a.flags).toContain('gaitAltered');
  });
});

describe('5 – Plötzlicher Schmerz / Warnzeichen', () => {
  it('stechender Schmerz → Rot, Training gestoppt, Untersuchung empfohlen – trotz sonst perfekter Werte', () => {
    const { sessions, fus, profile } = goodSeries(2);
    const date = addDays(START, 4);
    const s = session(date, [calfLog()], { warnings: ['suddenSharpPain'] });
    const ev = run(profile, [...sessions, s], [...fus, followUp(s)], addDays(date, 1));
    const dec = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(dec.type).toBe('stop');
    expect(ev.safety.level).toBe('stop');
    expect(ev.plan.kind).toBe('stop');
    expect(ev.plan.items).toHaveLength(0);
    expect(ev.plan.notes.join(' ')).toMatch(/ärztliche Untersuchung/);
  });
  it('Atemnot/Brustschmerz → Notfallempfehlung', () => {
    const s = session(START, [calfLog()], { warnings: ['breathlessnessChestPain'] });
    const ev = run(profileWith(), [s], [], addDays(START, 1));
    expect(ev.safety.level).toBe('emergency');
    expect(ev.plan.notes.join(' ')).toMatch(/112/);
  });
  it('Wadenschwellung mit Wärme → Stopp und zeitnahe Abklärung', () => {
    const s = session(START, [calfLog()]);
    const ev = run(profileWith(), [s], [followUp(s, { warnings: ['calfSwellingWarmthPain'] })], addDays(START, 1));
    expect(ev.safety.level).toBe('stop');
    expect(ev.plan.notes.join(' ')).toMatch(/zeitnahe ärztliche Abklärung/);
  });
  it('nach dokumentierter ärztlicher Abklärung wird reduziert fortgesetzt', () => {
    const s = session(START, [calfLog()], { warnings: ['popSensation'] });
    const ev = run(profileWith(), [s], [], addDays(START, 5), { adjustments: [{ id: 'a1', date: addDays(START, 4), createdAt: `${addDays(START, 4)}T10:00:00.000Z`, action: 'warningCleared' }] });
    expect(ev.safety.level).not.toBe('stop');
    expect(ev.familyStates.get('calf_raise')!.paused).toBe(false);
  });
});

describe('6 – Fehlende Folgetagsdaten', () => {
  it('ohne Folgetag keine Progression, auch bei drei guten Einheiten', () => {
    const p = profileWith();
    const ss = [0, 2, 4].map((i) => session(addDays(START, i), [calfLog()]));
    const ev = run(p, ss, [], addDays(START, 5));
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.current.reps).toBe(10);
    expect(st.toleratedAtLevel).toBe(0);
    expect(ev.families.get('calf_raise')!.decisions.every((d) => d.reasons.includes('followUpMissing'))).toBe(true);
    const sc = computeProgressionScore(ss[0], ss[0].exercises[0], undefined);
    expect(sc.missing).toContain('Folgetagsreaktion');
    expect(sc.total).toBeLessThanOrEqual(90);
    expect(ev.plan.pendingFollowUps.length).toBeGreaterThan(0);
  });
});

describe('7 – Kumulative Achillessehnenbelastung', () => {
  it('Wadenheber, langer Spaziergang und Laufintervalle summieren sich für Achillessehne/Wade', () => {
    const mon = session('2026-03-02', [calfLog()]);
    const tue = session('2026-03-03', [{ exerciseId: 'walking', planned: { durationSec: 3600, speedKmh: 4.5, surface: 'flat' } }]);
    const wed = session('2026-03-04', [{ exerciseId: 'run_walk_intervals', planned: { runSec: 30, walkSec: 90, rounds: 8, stage: 'A' } }]);
    const daily = LoadManagementEngine.dailyLoads([mon, tue, wed]);
    const sum = LoadManagementEngine.windowSum(daily, '2026-03-04', 7, 'achilles');
    const parts = [mon, tue, wed].map((s) => LoadManagementEngine.sessionLoad(s).byRegion.achilles);
    expect(sum).toBeCloseTo(parts.reduce((a, b) => a + b, 0), 1);
    expect(parts.every((x) => x > 0)).toBe(true);
  });
  it('plötzlich stark erhöhte Achillesbelastung → Spitze erkannt, Progression blockiert, Scheduler wählt Alternative', () => {
    const p = profileWith();
    const sessions: TrainingSession[] = [];
    const fus: FollowUpCheck[] = [];
    // drei Wochen leichtes Grundtraining
    for (let i = 0; i < 21; i += 2) {
      const s = session(addDays(START, i), [{ exerciseId: 'seated_calf_raise', planned: { sets: 2, reps: 10 } }]);
      sessions.push(s);
      fus.push(followUp(s));
    }
    // dann eine sehr belastende Woche
    for (let i = 21; i < 27; i++) {
      const s = session(addDays(START, i), [
        { exerciseId: 'bilateral_calf_raise', planned: { sets: 4, reps: 15 } },
        { exerciseId: 'walking', planned: { durationSec: 3600, speedKmh: 5 } }
      ]);
      sessions.push(s);
      fus.push(followUp(s));
    }
    const today = addDays(START, 27);
    const ev = run(p, sessions, fus, today);
    const row = ev.regionMatrix.find((r) => r.region === 'achilles')!;
    expect(['spike', 'elevated']).toContain(row.status);
    expect(row.ratio!).toBeGreaterThan(1.3);
    const ctx = ctxOf(p, sessions, fus, today);
    const status = LoadManagementEngine.exerciseRegionStatus(ctx.daily, today, ExerciseDatabase.require('bilateral_calf_raise'));
    const gate = SafetyGateEngine.checkProgression({
      profile: p,
      target: ExerciseDatabase.require('bilateral_calf_raise'),
      recovery: { status: 'green', flags: [], warnings: [], findings: [], hasFollowUp: true },
      score: computeProgressionScore(sessions[0], sessions[0].exercises[0], fus[0]),
      regionStatus: status,
      global: { level: 'ok', recurringShinPain: false, persistentComplaints: false },
      strengthLoss: false
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.some((r) => r === 'regionLoadSpike' || r === 'regionLoadElevated')).toBe(true);
  });
});

describe('8 – Joggen ohne Freigabe', () => {
  it('Laufmodul gesperrt, keine Laufeinheit im Plan, Begründung sichtbar', () => {
    const ev = run(profileWith(), [], [], START);
    expect(ev.runningPlan.status).toBe('locked');
    expect(ev.runningPlan.explanation).toBe('Heute findet kein Lauftraining statt, da deine medizinische Lauf-Freigabe noch nicht dokumentiert ist.');
    expect(ev.plan.items.some((i) => i.block === 'running')).toBe(false);
    expect(ev.plan.blocked.some((b) => b.label === 'Lauftraining')).toBe(true);
    expect(ev.readiness.find((r) => r.category === 'runStart')!.status).toBe('locked');
  });
  it('mit Freigabe, aber ohne funktionelle Kriterien → weiterhin kein Laufen', () => {
    const ev = run(profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises', 'jogging']), [], [], START);
    expect(ev.runningPlan.status).toBe('notReady');
    expect(ev.plan.items.some((i) => i.block === 'running')).toBe(false);
  });
});

describe('9 – Sprungtraining ohne Freigabe', () => {
  it('Sprungübungen und Bereitschaft gesperrt', () => {
    const ev = run(profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises', 'jogging', 'singleLeg']), [], [], START, { tests: [test_('singleLegCalfRaiseAffected', 30)] });
    expect(MedicalRestrictionsEngine.canPerform(ev.ctx.profile, ExerciseDatabase.require('pogo_jumps'))).toBe(false);
    expect(ev.readiness.find((r) => r.category === 'jumping')!.status).toBe('locked');
    expect(ev.football.currentPhase).toBeLessThan(6);
    expect(ev.plan.items.some((i) => i.exerciseId === 'pogo_jumps')).toBe(false);
  });
});

describe('10 – Fußball ohne Freigabe', () => {
  it('Fußballphasen ab 8 und Bereitschaft Fußball gesperrt', () => {
    const ev = run(profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises', 'jogging', 'jumping', 'singleLeg']), [], [], START);
    expect(ev.readiness.find((r) => r.category === 'football')!.status).toBe('locked');
    expect(ev.football.phases[7].unlocked).toBe(false);
    expect(ev.football.phases[7].criteria.find((c) => c.label.includes('Fußball'))!.met).toBe(false);
    expect(ev.plan.items.some((i) => i.block === 'sport')).toBe(false);
  });
});

describe('11 – Mehrere gute Einheiten', () => {
  it('schrittweise Progression 10 → 12 → 15, jeweils nur eine Variable, dann effizienter Modus', () => {
    const { ev } = goodSeries(14);
    const decs = ev.families.get('calf_raise')!.decisions.filter((d) => d.type === 'progress');
    expect(decs.length).toBeGreaterThanOrEqual(3);
    expect(decs[0].to.reps).toBe(12);
    expect(decs[1].to.reps).toBe(15);
    for (const d of decs) expect(changedKeys(d.from, d.to)).toHaveLength(1);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.efficientMode).toBe(true);
    expect(decs.at(-1)!.reasons).toContain('efficientMode');
  });
});

describe('12 – Mehrere Rückschritte', () => {
  it('wiederholte Beschwerden nach Steigerungen → konservativer Modus (mehr Bestätigungseinheiten)', () => {
    const p = profileWith();
    const sessions: TrainingSession[] = [];
    const fus: FollowUpCheck[] = [];
    let day = 0;
    for (let cycle = 0; cycle < 3; cycle++) {
      // so lange gute Einheiten, bis eine Steigerung erfolgt
      for (let k = 0; k < 6; k++) {
        const ev = run(p, sessions, fus, addDays(START, day));
        const st = ev.familyStates.get('calf_raise')!;
        if (ev.families.get('calf_raise')!.decisions.at(-1)?.type === 'progress') break;
        const s = session(addDays(START, day), [{ exerciseId: st.exerciseId, planned: st.current }]);
        sessions.push(s);
        fus.push(followUp(s));
        day += 2;
      }
      const ev = run(p, sessions, fus, addDays(START, day));
      const st = ev.familyStates.get('calf_raise')!;
      const bad = session(addDays(START, day), [{ exerciseId: st.exerciseId, planned: st.current }], { swelling: 1 });
      sessions.push(bad);
      fus.push(followUp(bad, { stiffness: 1 }));
      day += 2;
    }
    const ev = run(p, sessions, fus, addDays(START, day));
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.setbacks).toBeGreaterThanOrEqual(2);
    expect(st.conservativeLevel).toBeGreaterThanOrEqual(1);
    expect(st.efficientMode).toBe(false);
    expect(ev.families.get('calf_raise')!.decisions.some((d) => d.reasons.includes('setbackAfterProgression'))).toBe(true);
  });
});

describe('13 – Längere Trainingspause', () => {
  it('letzte Höchstleistung wird nicht automatisch übernommen', () => {
    const { sessions, fus, profile } = goodSeries(7);
    const last = sessions.at(-1)!.date;
    const ev0 = run(profile, sessions, fus, addDays(last, 1));
    const before = ev0.familyStates.get('calf_raise')!.current;
    const ev = run(profile, sessions, fus, addDays(last, 20));
    const item = ev.plan.items.find((i) => i.block === 'calf')!;
    expect(item.prescription.reps!).toBeLessThan(before.reps!);
    expect(item.explanation).toMatch(/20 Tage/);
    expect(item.changeType).toBe('deload');
  });
  it('nach > 28 Tagen Pause wird stärker reduziert und im Replay als Deload dokumentiert', () => {
    const { sessions, fus, profile } = goodSeries(7);
    const last = sessions.at(-1)!.date;
    const evGap = run(profile, sessions, fus, addDays(last, 30));
    const item = evGap.plan.items.find((i) => i.block === 'calf')!;
    const s = session(addDays(last, 30), [{ exerciseId: item.exerciseId, planned: item.prescription }]);
    const ev = run(profile, [...sessions, s], [...fus, followUp(s)], addDays(last, 31));
    expect(ev.families.get('calf_raise')!.decisions.some((d) => d.type === 'deload' && d.reasons.includes('trainingGap'))).toBe(true);
  });
});

describe('14 – Fehlende Daten', () => {
  it('fehlende Schmerz-/Schwellungs-/Gangdaten werden nicht positiv gewertet', () => {
    const s = session(START, [calfLog()], { painAfter: undefined, swelling: undefined, gait: undefined, fatigue: undefined });
    s.exercises[0].painDuring = undefined;
    s.exercises[0].rpe = undefined;
    s.exercises[0].movementQuality = undefined;
    const sc = computeProgressionScore(s, s.exercises[0], undefined);
    expect(sc.missing).toEqual(expect.arrayContaining(['Schmerz', 'Schwellung', 'Gangbild', 'Bewegungsqualität', 'Ermüdung', 'Folgetagsreaktion']));
    expect(sc.total).toBe(10);
    expect(sc.band).toBe('noProgress');
  });
  it('fehlende Schwellungs-/Gangdaten blockieren Progression trotz Folgetag', () => {
    const p = profileWith();
    const ss = [0, 2, 4].map((i) => session(addDays(START, i), [calfLog()], { swelling: undefined, gait: undefined }));
    const fus = ss.map((s) => followUp(s, { gait: 'notAssessable', swelling: 0 }));
    const ev = run(p, ss, fus, addDays(START, 5));
    expect(ev.familyStates.get('calf_raise')!.current.reps).toBe(10);
  });
});

describe('15 – Medizinische Einschränkungen', () => {
  it('ohne Wadenheber-Freigabe bleibt es bei der sitzenden Variante, auch wenn sie ausgeschöpft ist', () => {
    const p = profileWith(['fullWeightBearing', 'strengthTraining']);
    const { ev } = goodSeries(22, 'calf_raise', START, p);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.exerciseId).toBe('seated_calf_raise');
    const last = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(ev.families.get('calf_raise')!.decisions.some((d) => d.reasons.includes('missingClearance'))).toBe(true);
    expect(last.type).not.toBe('variantChange');
  });
  it('ohne jegliche Freigabe: nur unbelastete Mobilisation', () => {
    const p = profileWith([]);
    const ev = run(p, [], [], START);
    expect(ev.plan.items.length).toBeGreaterThan(0);
    for (const it of ev.plan.items) expect(ExerciseDatabase.require(it.exerciseId).requiredClearances).toHaveLength(0);
    expect(ev.plan.notes.join(' ')).toMatch(/keine medizinische Freigabe/);
  });
  it('dokumentiert verweigerte Freigabe sperrt einbeinige Übungen', () => {
    const p = profileWith(['fullWeightBearing', 'strengthTraining', 'calfRaises']);
    p.clearances.singleLeg = { key: 'singleLeg', status: 'denied', date: START, source: 'Physio', restrictions: 'Noch keine einbeinige Belastung' };
    expect(MedicalRestrictionsEngine.canPerform(p, ExerciseDatabase.require('single_leg_calf_raise'))).toBe(false);
    expect(MedicalRestrictionsEngine.activeRestrictions(p).some((r) => r.kind === 'denied')).toBe(true);
  });
});

describe('16 – Überlastungssituationen', () => {
  it('Tagesspitze wird erkannt und in der Analyse benannt', () => {
    const p = profileWith();
    const sessions: TrainingSession[] = [];
    const fus: FollowUpCheck[] = [];
    for (let i = 0; i < 14; i += 2) {
      const s = session(addDays(START, i), [{ exerciseId: 'walking', planned: { durationSec: 900, speedKmh: 4 } }]);
      sessions.push(s);
      fus.push(followUp(s));
    }
    const big = session(addDays(START, 14), [{ exerciseId: 'walking', planned: { durationSec: 5400, speedKmh: 5.5, inclinePct: 6 } }]);
    sessions.push(big);
    fus.push(followUp(big));
    const ev = run(p, sessions, fus, addDays(START, 14));
    expect(ev.regionMatrix.find((r) => r.region === 'tibia')!.status).toBe('spike');
    const ev2 = run(p, sessions, fus, addDays(START, 15));
    const walk = ev2.plan.items.find((i) => i.block === 'endurance');
    expect(walk?.exerciseId === 'ergometer' || /Belastung/.test(walk?.note ?? '')).toBe(true);
  });
});

describe('17 – Gleichzeitige Progressionsversuche', () => {
  it('nextProgressionStep verändert immer genau eine Variable', () => {
    for (const def of ExerciseDatabase.all()) {
      let p = { ...def.defaultPrescription };
      for (let i = 0; i < 20; i++) {
        const step = nextProgressionStep(def, p);
        if (!step) break;
        expect(changedKeys(p, step.to)).toHaveLength(1);
        p = step.to;
      }
    }
  });
  it('Ergometer: Dauer und Widerstand werden nie gleichzeitig erhöht', () => {
    const def = ExerciseDatabase.require('ergometer');
    let p = def.defaultPrescription;
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const st = nextProgressionStep(def, p);
      if (!st) break;
      seen.push(st.variable);
      p = st.to;
    }
    expect(seen.indexOf('resistance')).toBeGreaterThan(seen.lastIndexOf('duration'));
  });
});

describe('18 – Regression', () => {
  it('Orange reduziert die zuletzt gesteigerte Variable, nicht unter Ausgangswert', () => {
    const { sessions, fus, profile } = goodSeries(3);
    const date = addDays(START, 6);
    const s = session(date, [calfLog({ ...CALF10, reps: 12 }, { quality: 'painful' })]);
    const ev = run(profile, [...sessions, s], [...fus, followUp(s)], addDays(date, 1));
    const d = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(d.type).toBe('regress');
    expect(d.changedVariable).toBe('reps');
    expect(d.to.reps).toBe(10);
  });
});

describe('19 – Recovery-Ampel', () => {
  it('starke Schwellung → Rot; Warnzeichen unabhängig vom Score', () => {
    const s = session(START, [calfLog()], { swelling: 3 });
    expect(RecoveryAssessmentEngine.assess({ session: s, followUp: followUp(s) }).status).toBe('red');
    const s2 = session(START, [calfLog()], { warnings: ['suddenStrengthLoss'] });
    const sc = computeProgressionScore(s2, s2.exercises[0], followUp(s2));
    expect(sc.total).toBe(100);
    expect(RecoveryAssessmentEngine.assess({ session: s2, followUp: followUp(s2) }).status).toBe('red');
  });
  it('Verschlechterte Beweglichkeit am Folgetag → Orange', () => {
    const s = session(START, [calfLog()]);
    expect(RecoveryAssessmentEngine.assess({ session: s, followUp: followUp(s, { mobility: 'worse' }) }).status).toBe('orange');
  });
});

describe('20 – Trainingsscheduler', () => {
  it('erstellt einen vollständigen, zeitlich begrenzten Tagesplan', () => {
    const p = profileWith(undefined, { availableMinutes: 40 });
    const ev = run(p, [], [], START);
    expect(ev.plan.kind).toBe('training');
    const blocks = new Set(ev.plan.items.map((i) => i.block));
    expect(blocks.has('calf')).toBe(true);
    expect(blocks.has('endurance')).toBe(true);
    expect(ev.plan.totalMinutes).toBeLessThanOrEqual(40);
    for (const it of ev.plan.items) expect(it.explanation.length).toBeGreaterThan(5);
  });
  it('Wadenheber nicht an zwei Tagen in Folge – isometrische Alternative', () => {
    const p = profileWith();
    const s = session(START, [calfLog()]);
    const ev = run(p, [s], [followUp(s)], addDays(START, 1));
    const calf = ev.plan.items.find((i) => i.block === 'calf')!;
    expect(calf.exerciseId).toMatch(/calf_iso/);
  });
  it('Ruhetag, wenn das Wochenziel erreicht ist', () => {
    const p = profileWith(undefined, { sessionsPerWeek: 2 });
    const s1 = session(START, [calfLog()]);
    const s2 = session(addDays(START, 2), [calfLog()]);
    const ev = run(p, [s1, s2], [followUp(s1), followUp(s2)], addDays(START, 4));
    expect(ev.plan.kind).toBe('rest');
  });
  it('heute bereits trainiert → kein zweiter Plan', () => {
    const s = session(START, [calfLog()]);
    expect(run(profileWith(), [s], [], START).plan.kind).toBe('done');
  });
  it('Lastberechnung nutzt profilspezifische Faktoren', () => {
    const walk = computeExerciseLoad(ExerciseDatabase.require('walking'), { durationSec: 900, speedKmh: 4 });
    const walkUphill = computeExerciseLoad(ExerciseDatabase.require('walking'), { durationSec: 900, speedKmh: 4, inclinePct: 6 });
    const single = computeExerciseLoad(ExerciseDatabase.require('single_leg_calf_raise'), { sets: 3, reps: 10 });
    const both = computeExerciseLoad(ExerciseDatabase.require('bilateral_calf_raise'), { sets: 3, reps: 10 });
    expect(walkUphill).toBeGreaterThan(walk);
    expect(single).toBeGreaterThan(both);
  });
});
