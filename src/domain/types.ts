/**
 * Zentrales Datenmodell der Anwendung.
 *
 * Alle Typen sind bewusst UI-unabhängig. Die Engines (src/engine) arbeiten
 * ausschließlich mit diesen Strukturen und sind dadurch isoliert testbar.
 */

/** ISO-Datum im Format YYYY-MM-DD (lokale Zeit). */
export type ISODate = string;

export type Side = 'left' | 'right';

// ---------------------------------------------------------------------------
// Anatomisches Modell
// ---------------------------------------------------------------------------

export const ANATOMICAL_REGIONS = [
  'tibia',
  'fibula',
  'achilles',
  'gastrocnemius',
  'soleus',
  'ankle',
  'footMuscles',
  'knee',
  'quadriceps',
  'hamstrings',
  'glutes',
  'hipStability',
  'balance',
  'endurance'
] as const;
export type AnatomicalRegion = (typeof ANATOMICAL_REGIONS)[number];

/** Gewichtung 0..1, wie stark eine Übung einen Bereich (vereinfacht) beansprucht. */
export type RegionWeights = Partial<Record<AnatomicalRegion, number>>;

// ---------------------------------------------------------------------------
// Medizinische Freigaben
// ---------------------------------------------------------------------------

export const CLEARANCE_KEYS = [
  'fullWeightBearing',
  'strengthTraining',
  'calfRaises',
  'singleLeg',
  'cycling',
  'jogging',
  'jumping',
  'football'
] as const;
export type ClearanceKey = (typeof CLEARANCE_KEYS)[number];

/** granted = dokumentiert erlaubt; denied = dokumentiert nicht erlaubt; unknown = keine Angabe. */
export type ClearanceStatus = 'granted' | 'denied' | 'unknown';

export interface MedicalClearance {
  key: ClearanceKey;
  status: ClearanceStatus;
  /** Datum der Freigabe / Aussage */
  date?: ISODate;
  /** Quelle, z. B. „Dr. Müller (Unfallchirurgie)“ oder „Physiotherapie“ */
  source?: string;
  /** Freitext-Einschränkungen zu dieser Freigabe */
  restrictions?: string;
}

export type ClearanceMap = Record<ClearanceKey, MedicalClearance>;

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export type GoalKey =
  | 'muscleBuilding'
  | 'calfStrength'
  | 'achillesLoading'
  | 'ankleStability'
  | 'footMuscles'
  | 'walking'
  | 'endurance'
  | 'jogging'
  | 'football';

export type AnkleMobility = 'good' | 'limited' | 'veryLimited';

export interface InjuryInfo {
  injuryType: string;
  side: Side;
  injuryDate?: ISODate;
  surgeryType: string;
  lastSurgeryDate?: ISODate;
  lastSurgeryType: string;
  healingStatus: string;
}

export interface BaselineCapacity {
  walkingMinutes: number | null;
  painFreeWalking: boolean | null;
  briskWalking: boolean | null;
  bilateralCalfRaise: boolean | null;
  bilateralCalfRaiseReps: number | null;
  singleLegStand: boolean | null;
  singleLegStandSeconds: number | null;
  ankleMobility: AnkleMobility | null;
  swelling: SwellingLevel | null;
  painLevel: number | null;
  movementLimitations: string;
}

export interface UserProfile {
  id: 'profile';
  createdAt: string;
  updatedAt: string;
  name?: string;
  injury: InjuryInfo;
  clearances: ClearanceMap;
  generalRestrictions: string;
  baseline: BaselineCapacity;
  goals: GoalKey[];
  /** Verfügbare Trainingszeit pro Einheit in Minuten */
  availableMinutes: number;
  /** Bevorzugte Trainingstage pro Woche (Richtwert für den Scheduler) */
  sessionsPerWeek: number;
  onboardingCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Übungen
// ---------------------------------------------------------------------------

export type ExerciseCategory =
  | 'footAnkle'
  | 'calfAchilles'
  | 'kneeThigh'
  | 'hipGlutes'
  | 'balance'
  | 'endurance'
  | 'running'
  | 'sport';

/** Berechnungsprofil der Load Management Engine */
export type LoadProfile =
  | 'strength'
  | 'calf'
  | 'isometric'
  | 'walking'
  | 'cycling'
  | 'running'
  | 'plyometric'
  | 'coordination'
  | 'mobility'
  | 'sport';

export type ProgressionVariable =
  | 'reps'
  | 'sets'
  | 'duration'
  | 'hold'
  | 'weight'
  | 'resistance'
  | 'rom'
  | 'tempo'
  | 'speed'
  | 'incline'
  | 'surface'
  | 'difficulty'
  | 'singleLeg'
  | 'explosiveness'
  | 'contacts';

export type Surface = 'flat' | 'mixed' | 'uneven';
export type RangeOfMotion = 'partial' | 'full' | 'deficit';
export type Tempo = 'normal' | 'slow' | 'eccentric';

/** Konkrete Belastungsvorgabe einer Übung. Nicht genutzte Felder bleiben undefiniert. */
export interface Prescription {
  sets?: number;
  reps?: number;
  /** Dauer pro Satz bzw. Gesamtdauer in Sekunden */
  durationSec?: number;
  /** Haltezeit isometrisch pro Wiederholung in Sekunden */
  holdSec?: number;
  weightKg?: number;
  /** Widerstandsstufe (Band 1–5 bzw. Ergometerstufe 1–10) */
  resistance?: number;
  rom?: RangeOfMotion;
  tempo?: Tempo;
  restSec?: number;
  speedKmh?: number;
  inclinePct?: number;
  surface?: Surface;
  /** Lauf-/Gehintervalle */
  runSec?: number;
  walkSec?: number;
  rounds?: number;
  /** Bodenkontakte bei Sprüngen */
  contacts?: number;
  /** Strecke pro Wiederholung in Metern */
  distanceM?: number;
  /** Subjektive Intensität bei Sprint/Sportdrills in % des Maximums */
  intensityPct?: number;
  /** Schwierigkeitsstufe (z. B. Stufenhöhe, Untergrundschwierigkeit) 1..n */
  level?: number;
  /** Laufstufe A–K (nur Laufmodul) */
  stage?: string;
}

export interface ProgressionStep {
  variable: ProgressionVariable;
  /** numerische Erhöhung (bei kategorialen Variablen ignoriert) */
  step?: number;
  max?: number;
  /** Abfolge für kategoriale Variablen (rom, tempo, surface) */
  sequence?: string[];
  /** Explizite Werteabfolge für numerische Variablen, z. B. Wiederholungen 10 → 12 → 15 */
  values?: number[];
}

export type ExercisePhase = 'base' | 'build' | 'advanced' | 'sport';

export interface FunctionalPrerequisite {
  /** Eine andere Übung muss mindestens diese Vorgabe stabil erreicht haben */
  exerciseId?: string;
  minReps?: number;
  minSets?: number;
  minDurationSec?: number;
  minHoldSec?: number;
  /** Funktionstest-Kriterium */
  test?: FunctionalTestKey;
  minValue?: number;
  label: string;
}

export type IllustrationKey = string;

export interface ExerciseDefinition {
  id: string;
  name: string;
  description: string;
  category: ExerciseCategory;
  /** Übungsfamilie für Variantenprogression, z. B. „calf_raise“ */
  family: string;
  /** Stufe innerhalb der Familie (1 = leichteste Variante) */
  familyLevel: number;
  muscles: string[];
  regions: RegionWeights;
  difficulty: 1 | 2 | 3 | 4 | 5;
  phase: ExercisePhase;
  loadProfile: LoadProfile;
  /** 0..1 – relative Stoßbelastung */
  impact: number;
  singleLeg: boolean;
  explosive: boolean;
  requiredClearances: ClearanceKey[];
  prerequisites: FunctionalPrerequisite[];
  execution: string[];
  commonErrors: string[];
  defaultPrescription: Prescription;
  /** Reihenfolge der Progressionsvariablen (übungsspezifisch) */
  progression: ProgressionStep[];
  progressionOptions: string[];
  simplifications: string[];
  safety: string[];
  medicalNotes: string[];
  illustration: IllustrationKey;
  /** Geschätzte Dauer in Minuten zur Zeitplanung */
  estMinutes: number;
  /** Wird in der Tagesplanung nicht automatisch eingeplant (z. B. Mannschaftstraining) */
  manualOnly?: boolean;
  /** Zugehörige Return-to-Football-Phase (1–12), falls Teil des Fußballmoduls */
  footballPhase?: number;
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

export type SwellingLevel = 0 | 1 | 2 | 3;
export type GaitPattern = 'normal' | 'slightlyAltered' | 'clearlyAltered' | 'notAssessable';
export type MovementQuality = 'controlled' | 'slightlyLimited' | 'clearlyLimited' | 'painful';
export type MobilityChange = 'better' | 'same' | 'worse';
export type PainLocation = 'shin' | 'achilles' | 'calf' | 'ankle' | 'foot' | 'knee' | 'scar' | 'other';

export const WARNING_SYMPTOMS = [
  'suddenSharpPain',
  'popSensation',
  'suddenStrengthLoss',
  'suspectedAchillesInjury',
  'calfSwellingWarmthPain',
  'breathlessnessChestPain',
  'severeSuddenPain'
] as const;
export type WarningSymptom = (typeof WARNING_SYMPTOMS)[number];

export interface ExerciseLog {
  exerciseId: string;
  planned: Prescription;
  actual: Prescription;
  completed: boolean;
  skipped: boolean;
  /** Subjektive Intensität (RPE) 0–10 */
  rpe?: number;
  painDuring?: number;
  movementQuality?: MovementQuality;
  /** Stabilität 1 (sehr instabil) – 5 (sehr stabil) */
  stability?: number;
  notes?: string;
}

export interface TrainingSession {
  id: string;
  date: ISODate;
  startedAt: string;
  completedAt?: string;
  status: 'draft' | 'completed' | 'aborted';
  painBefore?: number;
  painAfter?: number;
  swelling?: SwellingLevel;
  gait?: GaitPattern;
  fatigue?: number;
  painLocations?: PainLocation[];
  notes?: string;
  warnings: WarningSymptom[];
  exercises: ExerciseLog[];
}

/** Rückfrage am Folgetag: „Wie hat dein Bein auf die gestrige Belastung reagiert?“ */
export interface FollowUpCheck {
  id: string;
  sessionId: string;
  date: ISODate;
  pain: number;
  swelling: SwellingLevel;
  /** Steifigkeit 0 keine – 3 stark */
  stiffness: 0 | 1 | 2 | 3;
  gait: GaitPattern;
  mobility: MobilityChange;
  /** Allgemeine Belastbarkeit 0 (sehr schlecht) – 10 (sehr gut) */
  overallCapacity: number;
  painLocations?: PainLocation[];
  warnings: WarningSymptom[];
  notes?: string;
}

export type FunctionalTestKey =
  | 'singleLegCalfRaiseAffected'
  | 'singleLegCalfRaiseHealthy'
  | 'bilateralCalfRaise'
  | 'singleLegStandAffected'
  | 'kneeToWallAffectedCm'
  | 'painFreeWalkingMin'
  | 'hopTestAffectedCm'
  | 'hopTestHealthyCm';

export interface FunctionalTest {
  id: string;
  date: ISODate;
  key: FunctionalTestKey;
  value: number;
  notes?: string;
}

/** Manuelle Eingriffe des Nutzers – werden beim Replay berücksichtigt. */
export type ManualAdjustmentAction =
  | 'pause'
  | 'resume'
  | 'regress'
  | 'reset'
  | 'warningCleared'
  | 'footballPhaseConfirmed';

export interface ManualAdjustment {
  id: string;
  date: ISODate;
  createdAt: string;
  action: ManualAdjustmentAction;
  exerciseId?: string;
  /** Für footballPhaseConfirmed: Phasennummer */
  value?: number;
  note?: string;
}

export interface AppSettings {
  id: 'settings';
  theme: 'system' | 'light' | 'dark';
  disclaimerAccepted: boolean;
  /** Ergänzende Trainingsfreigabe-Hinweise sichtbar */
  showTechnicalDetails: boolean;
}

// ---------------------------------------------------------------------------
// Engine-Ausgaben
// ---------------------------------------------------------------------------

export type RecoveryStatus = 'green' | 'yellow' | 'orange' | 'red';

export type ExerciseStatus =
  | 'Initial'
  | 'Learning'
  | 'Stable'
  | 'ProgressionCandidate'
  | 'ProgressionApproved'
  | 'RegressionRequired'
  | 'Paused'
  | 'Locked';

export type DecisionType =
  | 'progress'
  | 'variantChange'
  | 'hold'
  | 'regress'
  | 'deload'
  | 'pause'
  | 'stop'
  | 'locked'
  | 'start';

/** Maschinenlesbare Begründungen – Grundlage der DecisionExplanationEngine */
export type ReasonCode =
  | 'toleratedSessions'
  | 'notEnoughTolerated'
  | 'followUpUnremarkable'
  | 'followUpMissing'
  | 'scoreHigh'
  | 'scoreMaintain'
  | 'scoreReview'
  | 'scoreLow'
  | 'recoveryYellow'
  | 'recoveryOrange'
  | 'recoveryRed'
  | 'warningSymptom'
  | 'painIncrease'
  | 'swelling'
  | 'gaitAltered'
  | 'strengthLoss'
  | 'mobilityWorse'
  | 'recurringShinPain'
  | 'persistentComplaints'
  | 'missingClearance'
  | 'missingPrerequisite'
  | 'missingData'
  | 'regionLoadElevated'
  | 'regionLoadSpike'
  | 'ladderMaxed'
  | 'singleVariable'
  | 'trainingGap'
  | 'conservativeMode'
  | 'efficientMode'
  | 'stagnation'
  | 'setbackAfterProgression'
  | 'manualPause'
  | 'manualRegress'
  | 'manualReset'
  | 'restDayRequired'
  | 'stageLocked'
  | 'firstSession';

export interface ScoreBreakdown {
  total: number;
  components: {
    key: 'pain' | 'swelling' | 'gait' | 'quality' | 'performance' | 'fatigue' | 'regeneration';
    label: string;
    weight: number;
    /** normalisierter Wert 0..1; null = fehlend (zählt 0) */
    normalized: number | null;
    points: number;
  }[];
  missing: string[];
  band: 'progress' | 'maintain' | 'review' | 'noProgress';
}

export interface RecoveryAssessment {
  status: RecoveryStatus;
  flags: ReasonCode[];
  warnings: WarningSymptom[];
  /** Kurzbeschreibung der relevanten Befunde */
  findings: string[];
  hasFollowUp: boolean;
}

export interface DecisionRecord {
  id: string;
  date: ISODate;
  sessionId?: string;
  exerciseId: string;
  type: DecisionType;
  changedVariable?: ProgressionVariable;
  from: Prescription;
  to: Prescription;
  fromExerciseId?: string;
  toExerciseId?: string;
  score?: ScoreBreakdown;
  recovery?: RecoveryAssessment;
  load?: number;
  reasons: ReasonCode[];
  /** Kontextwerte für Erklärungen (z. B. Anzahl verträglicher Einheiten) */
  context: Record<string, string | number | boolean | undefined>;
  explanation: string;
  statusAfter: ExerciseStatus;
}

export interface ExerciseState {
  exerciseId: string;
  status: ExerciseStatus;
  current: Prescription;
  /** Index im Progressionspfad, auf den sich der nächste Schritt bezieht */
  ladderIndex: number;
  toleratedAtLevel: number;
  /** Verträgliche Einheiten insgesamt (über alle Stufen) */
  toleratedTotal: number;
  sessionsAtLevel: number;
  totalSessions: number;
  lastPerformed?: ISODate;
  lastLevelChange?: ISODate;
  /** Höchste je erreichte Vorgabe (wird bei Pausen nicht automatisch übernommen) */
  peak: Prescription;
  successfulProgressions: number;
  setbacks: number;
  /** 0 normal, 1–2 konservativer (mehr verträgliche Einheiten nötig) */
  conservativeLevel: number;
  /** true, wenn wiederholt gut vertragen → kleinere/effizientere Planung */
  efficientMode: boolean;
  lastProgressionVariable?: ProgressionVariable;
  lastDecision?: DecisionRecord;
  paused: boolean;
}
