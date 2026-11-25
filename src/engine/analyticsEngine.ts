/**
 * AnalyticsEngine
 *
 * Zeitreihen und Wochenanalysen. Aussagen werden ausschließlich aus
 * vorhandenen Daten abgeleitet; bei zu wenig Daten wird dies offen gesagt.
 */
import type { ISODate, RecoveryStatus } from '../domain/types';
import type { EngineContext } from './context';
import { ExerciseDatabase } from './exerciseDatabase';
import { LoadManagementEngine } from './loadManagementEngine';
import { RecoveryAssessmentEngine } from './recoveryAssessmentEngine';
import { addDays, daysBetween } from '../utils/date';

export interface SeriesPoint {
  date: ISODate;
  value: number;
}

export interface Insight {
  kind: 'positive' | 'neutral' | 'caution';
  text: string;
}

export type RangeKey = '7' | '14' | '28' | 'all';

/** Wadenkraft-Index: Volumen gewichtet mit Variantenstufe (höhere Varianten = mehr Kraftanforderung). */
const CALF_LEVEL_WEIGHT: Record<string, number> = {
  seated_calf_raise: 0.4,
  supported_calf_raise: 0.7,
  bilateral_calf_raise: 1,
  step_calf_raise: 1.2,
  weighted_calf_raise: 1.4,
  eccentric_calf_raise: 1.6,
  single_leg_calf_raise: 2
};

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export const AnalyticsEngine = {
  inRange(date: ISODate, today: ISODate, range: RangeKey): boolean {
    if (range === 'all') return date <= today;
    const d = daysBetween(date, today);
    return d >= 0 && d < Number(range);
  },

  painSeries(ctx: EngineContext): SeriesPoint[] {
    const map = new Map<ISODate, number>();
    for (const s of ctx.completed) if (s.painAfter !== undefined) map.set(s.date, Math.max(map.get(s.date) ?? 0, s.painAfter));
    const fu = new Map<ISODate, number>();
    for (const f of ctx.followUps) fu.set(f.date, Math.max(fu.get(f.date) ?? 0, f.pain));
    for (const [d, v] of fu) map.set(d, Math.max(map.get(d) ?? 0, v));
    return [...map].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  },

  swellingSeries(ctx: EngineContext): SeriesPoint[] {
    const map = new Map<ISODate, number>();
    for (const s of ctx.completed) if (s.swelling !== undefined) map.set(s.date, Math.max(map.get(s.date) ?? 0, s.swelling));
    for (const f of ctx.followUps) map.set(f.date, Math.max(map.get(f.date) ?? 0, f.swelling));
    return [...map].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Wadenkraft-Index je Einheit (relativ, kein Messwert) */
  calfSeries(ctx: EngineContext): SeriesPoint[] {
    const out: SeriesPoint[] = [];
    for (const s of ctx.completed) {
      let v = 0;
      for (const l of s.exercises) {
        const w = CALF_LEVEL_WEIGHT[l.exerciseId];
        if (!w || l.skipped) continue;
        v += (l.actual.sets ?? 1) * (l.actual.reps ?? 0) * w * (1 + (l.actual.weightKg ?? 0) / 30);
      }
      if (v > 0) out.push({ date: s.date, value: Math.round(v) });
    }
    return out;
  },

  minutesSeries(ctx: EngineContext, ids: string[], field: 'walk' | 'run'): SeriesPoint[] {
    const out: SeriesPoint[] = [];
    for (const s of ctx.completed) {
      let sec = 0;
      for (const l of s.exercises) {
        if (!ids.includes(l.exerciseId) || l.skipped) continue;
        if (field === 'run') sec += l.actual.runSec !== undefined ? l.actual.runSec * (l.actual.rounds ?? 1) : l.actual.durationSec ?? 0;
        else sec += l.actual.durationSec ?? 0;
      }
      if (sec > 0) out.push({ date: s.date, value: Math.round(sec / 6) / 10 });
    }
    return out;
  },

  walkingSeries(ctx: EngineContext) {
    return AnalyticsEngine.minutesSeries(ctx, ['walking', 'brisk_walking'], 'walk');
  },
  runningSeries(ctx: EngineContext) {
    return AnalyticsEngine.minutesSeries(ctx, ['run_walk_intervals', 'continuous_jog'], 'run');
  },

  balanceSeries(ctx: EngineContext): SeriesPoint[] {
    const ids = ['single_leg_stand_supported', 'single_leg_stand', 'single_leg_stand_unstable'];
    const out: SeriesPoint[] = [];
    for (const s of ctx.completed) {
      const v = Math.max(0, ...s.exercises.filter((l) => ids.includes(l.exerciseId) && !l.skipped).map((l) => l.actual.durationSec ?? 0));
      if (v > 0) out.push({ date: s.date, value: v });
    }
    for (const t of ctx.tests.filter((t) => t.key === 'singleLegStandAffected')) out.push({ date: t.date, value: t.value });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  },

  loadSeries(ctx: EngineContext): SeriesPoint[] {
    return [...ctx.daily.values()].map((d) => ({ date: d.date, value: d.total })).sort((a, b) => a.date.localeCompare(b.date));
  },

  recoverySeries(ctx: EngineContext): { date: ISODate; status: RecoveryStatus; hasFollowUp: boolean }[] {
    return ctx.completed.map((s) => {
      const a = RecoveryAssessmentEngine.assess({ session: s, followUp: ctx.followUpBySession.get(s.id) });
      return { date: s.date, status: a.status, hasFollowUp: a.hasFollowUp };
    });
  },

  frequencyPerWeek(ctx: EngineContext, today: ISODate, weeks = 8): { weekStart: ISODate; count: number }[] {
    const out: { weekStart: ISODate; count: number }[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const end = addDays(today, -7 * w);
      const start = addDays(end, -6);
      out.push({ weekStart: start, count: ctx.completed.filter((s) => s.date >= start && s.date <= end).length });
    }
    return out;
  },

  /** Vergleich zweier Zeitfenster gleicher Länge */
  compare(series: SeriesPoint[], today: ISODate, days: number, agg: 'max' | 'avg' | 'sum' = 'max') {
    const cur = series.filter((p) => daysBetween(p.date, today) >= 0 && daysBetween(p.date, today) < days).map((p) => p.value);
    const prev = series.filter((p) => daysBetween(p.date, today) >= days && daysBetween(p.date, today) < 2 * days).map((p) => p.value);
    const f = (a: number[]) => (a.length ? (agg === 'max' ? Math.max(...a) : agg === 'sum' ? a.reduce((x, y) => x + y, 0) : avg(a)!) : null);
    return { current: f(cur), previous: f(prev), nCurrent: cur.length, nPrevious: prev.length };
  },

  insights(ctx: EngineContext, today: ISODate, days = 7): Insight[] {
    const out: Insight[] = [];
    if (ctx.completed.length < 2) return [{ kind: 'neutral', text: 'Noch zu wenig Trainingsdaten für eine Verlaufsanalyse. Nach einigen dokumentierten Einheiten erscheinen hier Auswertungen.' }];
    const label = days === 7 ? 'Vorwoche' : `vorherigen ${days} Tagen`;

    const walk = AnalyticsEngine.compare(AnalyticsEngine.walkingSeries(ctx), today, days, 'max');
    if (walk.current !== null && walk.previous !== null) {
      if (walk.current > walk.previous) out.push({ kind: 'positive', text: `Deine Gehfähigkeit hat sich im Vergleich zur ${label} verbessert (längste Gehzeit ${walk.previous} → ${walk.current} min).` });
      else if (walk.current < walk.previous) out.push({ kind: 'neutral', text: `Deine längste Gehzeit war geringer als in der ${label} (${walk.previous} → ${walk.current} min).` });
      else out.push({ kind: 'neutral', text: `Deine Gehzeit ist gegenüber der ${label} stabil (${walk.current} min).` });
    }

    const calf = AnalyticsEngine.compare(AnalyticsEngine.calfSeries(ctx), today, days, 'max');
    if (calf.current !== null && calf.previous !== null && calf.current > calf.previous) out.push({ kind: 'positive', text: `Deine Wadenheber sind stabiler geworden (Wadenkraft-Index ${calf.previous} → ${calf.current}).` });

    const run = AnalyticsEngine.compare(AnalyticsEngine.runningSeries(ctx), today, days, 'max');
    if (run.current !== null && run.previous !== null && run.current > run.previous) out.push({ kind: 'positive', text: `Deine Laufzeit pro Einheit ist gestiegen (${run.previous} → ${run.current} min).` });

    // Folgetagsreaktion
    const fuCur = ctx.followUps.filter((f) => daysBetween(f.date, today) >= 0 && daysBetween(f.date, today) < days);
    const fuPrev = ctx.followUps.filter((f) => daysBetween(f.date, today) >= days && daysBetween(f.date, today) < 2 * days);
    if (fuCur.length >= 2 && fuPrev.length >= 2) {
      const a = avg(fuCur.map((f) => f.pain + f.swelling * 2 + f.stiffness))!;
      const b = avg(fuPrev.map((f) => f.pain + f.swelling * 2 + f.stiffness))!;
      if (a < b - 0.3) out.push({ kind: 'positive', text: 'Die Belastungsreaktion am Folgetag hat sich verbessert.' });
      else if (a > b + 0.3) out.push({ kind: 'caution', text: 'Die Belastungsreaktion am Folgetag hat sich verschlechtert.' });
    }

    const load = LoadManagementEngine.totalChange(ctx.daily, today);
    if (load.changePct !== null && load.changePct >= 40) out.push({ kind: 'caution', text: `Deine Trainingsbelastung ist in den letzten sieben Tagen stark gestiegen (+${load.changePct} %).` });
    else if (load.changePct !== null && load.changePct <= -40) out.push({ kind: 'neutral', text: `Deine Trainingsbelastung war in den letzten sieben Tagen deutlich geringer (${load.changePct} %).` });

    const rec = AnalyticsEngine.recoverySeries(ctx).filter((r) => daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) < days);
    const bad = rec.filter((r) => r.status === 'orange' || r.status === 'red').length;
    const yellow = rec.filter((r) => r.status === 'yellow').length;
    if (rec.length && (bad >= 1 || yellow >= Math.ceil(rec.length / 2))) out.push({ kind: 'caution', text: 'Eine weitere Steigerung ist derzeit nicht sinnvoll – mehrere Einheiten waren mit Beschwerden verbunden.' });
    const missing = rec.filter((r) => !r.hasFollowUp).length;
    if (missing >= 2) out.push({ kind: 'neutral', text: `${missing} Einheiten ohne Folgetagsrückmeldung – diese können nicht für Steigerungen berücksichtigt werden.` });

    if (!out.length) out.push({ kind: 'neutral', text: 'Für den Zeitraum liegen noch keine vergleichbaren Werte vor.' });
    return out;
  },

  /** Entwicklung je anatomischem Bereich (7-Tage-Summe aktuell vs. davor) */
  regionDevelopment(ctx: EngineContext, today: ISODate) {
    return LoadManagementEngine.regionMatrix(ctx.daily, today).filter((r) => r.d28 > 0);
  },

  exerciseName(id: string): string {
    return ExerciseDatabase.get(id)?.name ?? id;
  }
};
