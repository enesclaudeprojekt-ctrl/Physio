/**
 * Konfigurierbare technische Startparameter.
 *
 * WICHTIG: Alle Grenzwerte sind technische Ausgangswerte für eine konservative,
 * nachvollziehbare Trainingssteuerung. Sie sind KEINE medizinisch validierten
 * Grenzwerte und ersetzen keine ärztliche oder physiotherapeutische Beurteilung.
 */
import type { LoadProfile } from '../domain/types';

export const SCORE_WEIGHTS = {
  pain: 25,
  swelling: 20,
  gait: 15,
  quality: 10,
  performance: 10,
  fatigue: 10,
  regeneration: 10
} as const;

export const SCORE_BANDS = {
  progress: 85,
  maintain: 70,
  review: 50
} as const;

export const PROGRESSION_CONFIG = {
  /** Benötigte verträgliche Einheiten auf derselben Stufe vor Progressionsprüfung */
  toleratedSessionsRequired: 3,
  /** Minimum im effizienten Modus */
  toleratedSessionsMin: 2,
  /** Maximale Zusatzanforderung im konservativen Modus */
  maxConservativeLevel: 2,
  /** Ab so vielen erfolgreichen Progressionen ohne Rückschlag → effizienter Modus */
  efficientAfterProgressions: 3,
  /** Pause in Tagen, ab der die Vorgabe reduziert wird */
  gapReduceDays: 14,
  /** Pause in Tagen, ab der stärker reduziert wird */
  gapStrongReduceDays: 28,
  /** Einheiten auf derselben Stufe ohne Progression → Stagnation prüfen */
  stagnationSessions: 8,
  /** Erfüllungsquote unter diesem Wert gilt als Leistungs-/Kraftverlust */
  strengthLossRatio: 0.75,
  /** Mindestens ein Tag Abstand zwischen Laufeinheiten */
  runningRestDays: 1,
  runningToleratedRequired: 2,
  /** Laufschmerz, ab dem die Stufe reduziert wird */
  runningPainRegress: 3
} as const;

export const RECOVERY_CONFIG = {
  /** Schmerz während/nach ≥ diesem Wert gilt als moderat → mindestens gelb */
  painYellow: 3,
  /** ≥ deutlich → orange */
  painOrange: 5,
  /** ≥ stark → rot (Abbruch) */
  painRed: 7,
  /** Anstieg gegenüber Ausgangsschmerz, ab dem „zunehmende Schmerzen“ gilt */
  painIncreaseDelta: 2,
  /** Tage, in denen ein Warnsymptom wirksam bleibt, wenn es nicht als abgeklärt markiert wurde */
  warningActiveDays: 365,
  /** Fenster für wiederkehrende Schienbeinschmerzen */
  shinPainWindowEntries: 5,
  shinPainThreshold: 2
} as const;

/**
 * Faktoren für das relative Belastungsmodell.
 * ExerciseLoad = VolumeFactor × IntensityFactor × ComplexityFactor × ImpactFactor × DurationFactor
 * Je Profil werden nur sinnvolle Faktoren verwendet.
 */
export interface LoadProfileConfig {
  /** Referenzvolumen, das VolumeFactor = 1 ergibt */
  referenceVolume: number;
  /** Basisgewicht des Profils */
  base: number;
  singleLegFactor: number;
  explosiveFactor: number;
  /** Gewichtung der Stoßbelastung (impact 0..1 der Übung) */
  impactWeight: number;
  /** Zusatzgewicht: kg, die die Intensität verdoppeln */
  weightDoublingKg: number;
  /** Zuschlag pro Widerstandsstufe */
  resistanceStep: number;
  /** Zuschlag pro Schwierigkeitsstufe > 1 */
  difficultyStep: number;
}

export const LOAD_PROFILES: Record<LoadProfile, LoadProfileConfig> = {
  strength: { referenceVolume: 30, base: 1, singleLegFactor: 1.5, explosiveFactor: 1.3, impactWeight: 0.5, weightDoublingKg: 40, resistanceStep: 0.08, difficultyStep: 0.12 },
  calf: { referenceVolume: 30, base: 1.1, singleLegFactor: 1.8, explosiveFactor: 1.4, impactWeight: 0.5, weightDoublingKg: 30, resistanceStep: 0.08, difficultyStep: 0.12 },
  isometric: { referenceVolume: 150, base: 0.7, singleLegFactor: 1.5, explosiveFactor: 1, impactWeight: 0, weightDoublingKg: 40, resistanceStep: 0.06, difficultyStep: 0.1 },
  walking: { referenceVolume: 900, base: 1, singleLegFactor: 1, explosiveFactor: 1, impactWeight: 0.6, weightDoublingKg: 100, resistanceStep: 0, difficultyStep: 0.05 },
  cycling: { referenceVolume: 900, base: 0.6, singleLegFactor: 1, explosiveFactor: 1, impactWeight: 0, weightDoublingKg: 100, resistanceStep: 0.07, difficultyStep: 0.05 },
  running: { referenceVolume: 300, base: 1.4, singleLegFactor: 1, explosiveFactor: 1, impactWeight: 1.2, weightDoublingKg: 100, resistanceStep: 0, difficultyStep: 0.05 },
  plyometric: { referenceVolume: 30, base: 1.6, singleLegFactor: 1.8, explosiveFactor: 1.4, impactWeight: 1.5, weightDoublingKg: 100, resistanceStep: 0, difficultyStep: 0.15 },
  coordination: { referenceVolume: 180, base: 0.5, singleLegFactor: 1.3, explosiveFactor: 1.2, impactWeight: 0.2, weightDoublingKg: 100, resistanceStep: 0, difficultyStep: 0.15 },
  mobility: { referenceVolume: 60, base: 0.2, singleLegFactor: 1, explosiveFactor: 1, impactWeight: 0, weightDoublingKg: 100, resistanceStep: 0.1, difficultyStep: 0.05 },
  sport: { referenceVolume: 600, base: 1.8, singleLegFactor: 1, explosiveFactor: 1.5, impactWeight: 1.3, weightDoublingKg: 100, resistanceStep: 0, difficultyStep: 0.15 }
};

export const LOAD_CONFIG = {
  /** Verhältnis 7-Tage-Last zu Wochendurchschnitt der 28 Tage, ab dem „erhöht“ gilt */
  elevatedRatio: 1.5,
  /** … ab dem eine Belastungsspitze erkannt wird */
  spikeRatio: 2.0,
  /** Mindestlast im 28-Tage-Fenster, damit Verhältnisse aussagekräftig sind */
  minChronicLoad: 3,
  /** Tageslast im Vergleich zum Tagesdurchschnitt der letzten 14 Tage */
  daySpikeRatio: 2.2
} as const;

export const READINESS_CONFIG = {
  walkingLongMin: 30,
  briskWalkingMin: 20,
  runStartWalkingMin: 30,
  runStartSingleLegCalfRaises: 15,
  runStartSingleLegStandSec: 30,
  continuousJogSingleLegCalfRaises: 20,
  jumpingSingleLegCalfRaises: 25,
  /** Seitenvergleich für Sprünge (Limb Symmetry Index in %) */
  hopSymmetryPct: 90,
  calfSymmetryPct: 90
} as const;
