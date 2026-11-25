/**
 * Abschnitt 25: Konkrete Simulation der Progressionslogik (beidbeinige Wadenheber).
 */
import { describe, expect, it } from 'vitest';
import { followUp, profileWith, run, session, START } from './helpers';
import { addDays } from '../src/utils/date';
import { runCalfRaiseSimulation } from '../src/engine/simulation';

describe('Simulation Wadenheber (Abschnitt 25)', () => {
  const profile = profileWith();
  const P10 = { sets: 3, reps: 10, restSec: 60, tempo: 'normal' as const };
  const P12 = { ...P10, reps: 12 };
  const d = (i: number) => addDays(START, i * 2);

  const s1 = session(d(0), [{ exerciseId: 'bilateral_calf_raise', planned: P10, painDuring: 1 }], { painAfter: 1 });
  const s2 = session(d(1), [{ exerciseId: 'bilateral_calf_raise', planned: P10 }]);
  const s3 = session(d(2), [{ exerciseId: 'bilateral_calf_raise', planned: P10 }]);
  const s4 = session(d(3), [{ exerciseId: 'bilateral_calf_raise', planned: P12, painDuring: 2 }], { painAfter: 2, swelling: 1 });
  const s5 = session(d(4), [{ exerciseId: 'bilateral_calf_raise', planned: P12 }]);
  const fus = [followUp(s1), followUp(s2), followUp(s3), followUp(s4, { stiffness: 1, pain: 1 }), followUp(s5)];

  const evalAt = (sessions: typeof s1[], n: number) => run(profile, sessions, fus.slice(0, n), addDays(sessions[sessions.length - 1].date, 1));

  it('Einheit 1–2: noch keine Progression (zu wenige verträgliche Einheiten)', () => {
    const ev = evalAt([s1, s2], 2);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.exerciseId).toBe('bilateral_calf_raise');
    expect(st.current.reps).toBe(10);
    expect(st.toleratedAtLevel).toBe(2);
    const last = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(last.type).toBe('hold');
    expect(last.reasons).toContain('notEnoughTolerated');
  });

  it('Einheit 3: Engine prüft und erlaubt kleine Progression auf 3 × 12 (nur Wiederholungen)', () => {
    const ev = evalAt([s1, s2, s3], 3);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.current.reps).toBe(12);
    expect(st.current.sets).toBe(3);
    expect(st.current.weightKg).toBeUndefined();
    const dec = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(dec.type).toBe('progress');
    expect(dec.changedVariable).toBe('reps');
    expect(dec.explanation).toContain('ausschließlich die Wiederholungszahl');
    expect(dec.explanation).toContain('Folgetagsreaktion war unauffällig');
    expect(dec.score!.total).toBeGreaterThanOrEqual(85);
  });

  it('Einheit 4: leichte Beschwerden → keine weitere Progression', () => {
    const ev = evalAt([s1, s2, s3, s4], 4);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.current.reps).toBe(12);
    const dec = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(dec.type).toBe('hold');
    expect(dec.recovery!.status).toBe('yellow');
    expect(dec.reasons).toContain('recoveryYellow');
    expect(dec.reasons).toContain('setbackAfterProgression');
    expect(dec.score!.total).toBeLessThan(85);
  });

  it('Einheit 5: gute Reaktion → Stufe 3 × 12 wird stabilisiert, keine sofortige Steigerung', () => {
    const ev = evalAt([s1, s2, s3, s4, s5], 5);
    const st = ev.familyStates.get('calf_raise')!;
    expect(st.current.reps).toBe(12);
    expect(st.toleratedAtLevel).toBe(1);
    const dec = ev.families.get('calf_raise')!.decisions.at(-1)!;
    expect(dec.type).toBe('hold');
    expect(dec.reasons).toContain('notEnoughTolerated');
    expect(dec.explanation).toMatch(/1 von 3/);
  });

  it('Für jede Einheit werden Eingangsdaten, Score, Recovery, Belastung, Entscheidung, Begründung und neue Vorgabe gespeichert', () => {
    const ev = evalAt([s1, s2, s3, s4, s5], 5);
    const decs = ev.families.get('calf_raise')!.decisions;
    expect(decs).toHaveLength(5);
    for (const dc of decs) {
      expect(dc.sessionId).toBeDefined();
      expect(dc.score).toBeDefined();
      expect(dc.recovery).toBeDefined();
      expect(dc.load).toBeGreaterThan(0);
      expect(dc.explanation.length).toBeGreaterThan(10);
      expect(dc.to.reps).toBeDefined();
    }
  });

  it('Simulationsmodul liefert dieselbe Tabelle', () => {
    const rows = runCalfRaiseSimulation();
    expect(rows.map((r) => r.decision)).toEqual(['hold', 'hold', 'progress', 'hold', 'hold']);
    expect(rows.map((r) => r.newPrescription)).toEqual(['3 × 10', '3 × 10', '3 × 12', '3 × 12', '3 × 12']);
    expect(rows[3].recovery).toBe('yellow');
  });
});
