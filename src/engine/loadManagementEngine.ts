/**
 * LoadManagementEngine
 *
 * Relatives, internes Belastungsmodell. Die berechneten Werte dienen
 * ausschließlich dem Vergleich innerhalb der eigenen Trainingshistorie und
 * sind KEIN medizinischer Messwert der tatsächlichen Gewebebelastung.
 *
 * ExerciseLoad = Base × VolumeFactor × IntensityFactor × ComplexityFactor × ImpactFactor × DurationFactor
 * – wobei je Berechnungsprofil nur passende Faktoren genutzt werden.
 */
import type { AnatomicalRegion, ExerciseCategory, ExerciseDefinition, ISODate, Prescription, TrainingSession } from '../domain/types';
import { ANATOMICAL_REGIONS } from '../domain/types';
import { LOAD_CONFIG, LOAD_PROFILES } from './config';
import { ExerciseDatabase } from './exerciseDatabase';
import { addDays, daysBetween } from '../utils/date';

export interface LoadFactors {
  volume: number;
  intensity: number;
  complexity: number;
  impact: number;
  duration: number;
  base: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeLoadFactors(def: ExerciseDefinition, p: Prescription): LoadFactors {
  const cfg = LOAD_PROFILES[def.loadProfile];
  const sets = p.sets ?? 1;
  let volume = 1;
  let intensity = 1;
  let duration = 1;

  switch (def.loadProfile) {
    case 'strength':
    case 'calf': {
      const reps = p.reps ?? 0;
      const holdBonus = p.holdSec ? 1 + p.holdSec / 10 : 1;
      volume = (sets * reps * holdBonus) / cfg.referenceVolume;
      if (p.tempo === 'slow') intensity *= 1.15;
      if (p.tempo === 'eccentric') intensity *= 1.25;
      if (p.rom === 'partial') intensity *= 0.85;
      if (p.rom === 'deficit') intensity *= 1.15;
      break;
    }
    case 'isometric': {
      volume = (sets * (p.reps ?? 1) * (p.holdSec ?? 0)) / cfg.referenceVolume;
      break;
    }
    case 'walking': {
      volume = 1;
      duration = (p.durationSec ?? 0) / cfg.referenceVolume;
      const speed = p.speedKmh ?? 4;
      intensity *= Math.pow(speed / 4, 1.5);
      intensity *= 1 + (p.inclinePct ?? 0) * 0.05;
      intensity *= p.surface === 'uneven' ? 1.15 : p.surface === 'mixed' ? 1.08 : 1;
      break;
    }
    case 'cycling': {
      duration = (p.durationSec ?? 0) / cfg.referenceVolume;
      break;
    }
    case 'running': {
      const run = p.runSec !== undefined ? p.runSec * (p.rounds ?? 1) : p.durationSec ?? 0;
      const walk = p.walkSec !== undefined ? p.walkSec * (p.rounds ?? 1) : 0;
      duration = (run + walk * 0.25) / cfg.referenceVolume;
      break;
    }
    case 'plyometric': {
      volume = (sets * (p.contacts ?? 0)) / cfg.referenceVolume;
      break;
    }
    case 'coordination': {
      const t = p.durationSec !== undefined ? sets * p.durationSec : sets * (p.reps ?? 0) * 10;
      duration = t / cfg.referenceVolume;
      break;
    }
    case 'mobility': {
      volume = p.reps !== undefined ? (sets * p.reps) / cfg.referenceVolume : (sets * (p.durationSec ?? 60)) / cfg.referenceVolume;
      break;
    }
    case 'sport': {
      const t = p.durationSec !== undefined ? sets * p.durationSec : sets * (p.reps ?? 0) * 30;
      duration = t / cfg.referenceVolume;
      intensity *= Math.pow((p.intensityPct ?? 60) / 60, 1.5);
      break;
    }
  }

  if (p.weightKg) intensity *= 1 + p.weightKg / cfg.weightDoublingKg;
  if (p.resistance) intensity *= 1 + cfg.resistanceStep * Math.max(0, p.resistance - 1);
  if (p.level && p.level > 1) intensity *= 1 + 0.1 * (p.level - 1);

  let complexity = 1 + cfg.difficultyStep * (def.difficulty - 1);
  if (def.singleLeg) complexity *= cfg.singleLegFactor;
  if (def.explosive) complexity *= cfg.explosiveFactor;

  const impact = 1 + cfg.impactWeight * def.impact;
  const total = cfg.base * volume * intensity * complexity * impact * duration;
  return { volume: r2(volume), intensity: r2(intensity), complexity: r2(complexity), impact: r2(impact), duration: r2(duration), base: cfg.base, total: r2(total) };
}

export function computeExerciseLoad(def: ExerciseDefinition, p: Prescription): number {
  return computeLoadFactors(def, p).total;
}

export interface DayLoad {
  date: ISODate;
  total: number;
  byRegion: Record<AnatomicalRegion, number>;
  byCategory: Partial<Record<ExerciseCategory, number>>;
}

function emptyRegions(): Record<AnatomicalRegion, number> {
  return Object.fromEntries(ANATOMICAL_REGIONS.map((r) => [r, 0])) as Record<AnatomicalRegion, number>;
}

export type RegionLoadStatus = 'none' | 'low' | 'normal' | 'elevated' | 'spike';

export interface RegionLoadRow {
  region: AnatomicalRegion;
  day: number;
  d7: number;
  d14: number;
  d28: number;
  /** Veränderung der letzten 7 Tage gegenüber den 7 Tagen davor in % (null = keine Vergleichsbasis) */
  changePct: number | null;
  /** 7-Tage-Last / (28-Tage-Last / 4) */
  ratio: number | null;
  status: RegionLoadStatus;
}

export const REGION_LABEL: Record<AnatomicalRegion, string> = {
  tibia: 'Tibia',
  fibula: 'Fibula',
  achilles: 'Achillessehne',
  gastrocnemius: 'Gastrocnemius',
  soleus: 'Soleus',
  ankle: 'Sprunggelenk',
  footMuscles: 'Fußmuskulatur',
  knee: 'Knie',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Gesäß',
  hipStability: 'Hüftstabilität',
  balance: 'Gleichgewicht',
  endurance: 'Ausdauer'
};

export const LoadManagementEngine = {
  sessionLoad(session: TrainingSession): { total: number; byRegion: Record<AnatomicalRegion, number>; byCategory: Partial<Record<ExerciseCategory, number>> } {
    const byRegion = emptyRegions();
    const byCategory: Partial<Record<ExerciseCategory, number>> = {};
    let total = 0;
    for (const log of session.exercises) {
      if (log.skipped) continue;
      const def = ExerciseDatabase.get(log.exerciseId);
      if (!def) continue;
      const l = computeExerciseLoad(def, log.actual);
      total += l;
      byCategory[def.category] = r2((byCategory[def.category] ?? 0) + l);
      for (const [reg, w] of Object.entries(def.regions) as [AnatomicalRegion, number][]) byRegion[reg] = r2(byRegion[reg] + l * w);
    }
    return { total: r2(total), byRegion, byCategory };
  },

  dailyLoads(sessions: TrainingSession[]): Map<ISODate, DayLoad> {
    const map = new Map<ISODate, DayLoad>();
    for (const s of sessions) {
      if (s.status === 'draft') continue;
      const sl = LoadManagementEngine.sessionLoad(s);
      const d = map.get(s.date) ?? { date: s.date, total: 0, byRegion: emptyRegions(), byCategory: {} };
      d.total = r2(d.total + sl.total);
      for (const r of ANATOMICAL_REGIONS) d.byRegion[r] = r2(d.byRegion[r] + sl.byRegion[r]);
      for (const [c, v] of Object.entries(sl.byCategory) as [ExerciseCategory, number][]) d.byCategory[c] = r2((d.byCategory[c] ?? 0) + v);
      map.set(s.date, d);
    }
    return map;
  },

  /** Summe einer Region im Fenster (endDate inklusive, `days` Tage zurück). */
  windowSum(daily: Map<ISODate, DayLoad>, endDate: ISODate, days: number, region?: AnatomicalRegion): number {
    let sum = 0;
    for (const [date, d] of daily) {
      const diff = daysBetween(date, endDate);
      if (diff >= 0 && diff < days) sum += region ? d.byRegion[region] : d.total;
    }
    return r2(sum);
  },

  regionRow(daily: Map<ISODate, DayLoad>, date: ISODate, region: AnatomicalRegion): RegionLoadRow {
    const day = daily.get(date)?.byRegion[region] ?? 0;
    const d7 = LoadManagementEngine.windowSum(daily, date, 7, region);
    const d14 = LoadManagementEngine.windowSum(daily, date, 14, region);
    const d28 = LoadManagementEngine.windowSum(daily, date, 28, region);
    const prev7 = LoadManagementEngine.windowSum(daily, addDays(date, -7), 7, region);
    const changePct = prev7 > 0 ? Math.round(((d7 - prev7) / prev7) * 100) : null;
    // Wochenschnitt der drei Wochen VOR der aktuellen Woche, damit die aktuelle Woche sich nicht selbst „verdünnt“
    const prior21 = LoadManagementEngine.windowSum(daily, addDays(date, -7), 21, region);
    // Nur Zeiträume mit vorhandener Historie zählen (sonst „verdünnen“ Tage vor Trainingsbeginn den Durchschnitt)
    let first: ISODate | undefined;
    for (const [dd, dl] of daily) if (dl.byRegion[region] > 0 && dd <= date && (!first || dd < first)) first = dd;
    const historyDays = first ? daysBetween(first, date) + 1 : 0;
    const chronicDays = Math.min(21, historyDays - 7);
    const chronicWeekly = chronicDays >= 7 ? prior21 / (chronicDays / 7) : 0;
    const ratio = prior21 >= LOAD_CONFIG.minChronicLoad && chronicWeekly > 0 ? r2(d7 / chronicWeekly) : null;

    // Tagesspitze im Vergleich zum Tagesdurchschnitt der vorherigen 14 Tage (nur Trainingstage)
    let priorDays = 0;
    let priorSum = 0;
    for (const [dd, dl] of daily) {
      const diff = daysBetween(dd, date);
      if (diff > 0 && diff <= 14 && dl.byRegion[region] > 0) {
        priorDays++;
        priorSum += dl.byRegion[region];
      }
    }
    const daySpike = priorDays >= 3 && day > (priorSum / priorDays) * LOAD_CONFIG.daySpikeRatio;

    let status: RegionLoadStatus;
    if (d28 === 0) status = 'none';
    else if ((ratio !== null && ratio >= LOAD_CONFIG.spikeRatio) || daySpike) status = 'spike';
    else if (ratio !== null && ratio >= LOAD_CONFIG.elevatedRatio) status = 'elevated';
    else if (ratio !== null && ratio < 0.6) status = 'low';
    else status = 'normal';
    return { region, day, d7, d14, d28, changePct, ratio, status };
  },

  regionMatrix(daily: Map<ISODate, DayLoad>, date: ISODate): RegionLoadRow[] {
    return ANATOMICAL_REGIONS.map((r) => LoadManagementEngine.regionRow(daily, date, r));
  },

  /**
   * Status relevanter Regionen einer Übung. Berücksichtigt nur Regionen,
   * die die Übung deutlich beanspruchen (Gewicht ≥ 0.4).
   */
  exerciseRegionStatus(daily: Map<ISODate, DayLoad>, date: ISODate, def: ExerciseDefinition): { worst: RegionLoadStatus; regions: AnatomicalRegion[] } {
    let worst: RegionLoadStatus = 'normal';
    const regions: AnatomicalRegion[] = [];
    for (const [reg, w] of Object.entries(def.regions) as [AnatomicalRegion, number][]) {
      if (w < 0.4 || reg === 'endurance' || reg === 'balance') continue;
      const row = LoadManagementEngine.regionRow(daily, date, reg);
      if (row.status === 'spike') {
        worst = 'spike';
        regions.push(reg);
      } else if (row.status === 'elevated') {
        if (worst !== 'spike') worst = 'elevated';
        regions.push(reg);
      }
    }
    return { worst, regions };
  },

  /** Gesamtlast-Trend: 7-Tage-Änderung in % */
  totalChange(daily: Map<ISODate, DayLoad>, date: ISODate): { d7: number; prev7: number; changePct: number | null } {
    const d7 = LoadManagementEngine.windowSum(daily, date, 7);
    const prev7 = LoadManagementEngine.windowSum(daily, addDays(date, -7), 7);
    return { d7, prev7, changePct: prev7 > 0 ? Math.round(((d7 - prev7) / prev7) * 100) : null };
  }
};
