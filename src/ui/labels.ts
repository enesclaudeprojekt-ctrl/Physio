import type { ExerciseStatus, GaitPattern, GoalKey, MovementQuality, PainLocation, DecisionType, FunctionalTestKey } from '../domain/types';

export const GOAL_LABEL: Record<GoalKey, string> = {
  muscleBuilding: 'Muskulatur aufbauen',
  calfStrength: 'Wadenmuskulatur stärken',
  achillesLoading: 'Achillessehne schrittweise belasten',
  ankleStability: 'Sprunggelenk stabilisieren',
  footMuscles: 'Fußmuskulatur aufbauen',
  walking: 'Gehfähigkeit verbessern',
  endurance: 'Ausdauer verbessern',
  jogging: 'Joggen wieder ermöglichen',
  football: 'Langfristig Fußball spielen'
};

export const GAIT_OPTIONS: { value: GaitPattern; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'slightlyAltered', label: 'Leicht verändert' },
  { value: 'clearlyAltered', label: 'Deutlich verändert' },
  { value: 'notAssessable', label: 'Nicht beurteilbar' }
];
export const GAIT_LABEL = Object.fromEntries(GAIT_OPTIONS.map((o) => [o.value, o.label])) as Record<GaitPattern, string>;

export const QUALITY_OPTIONS: { value: MovementQuality; label: string }[] = [
  { value: 'controlled', label: 'Kontrolliert' },
  { value: 'slightlyLimited', label: 'Leicht eingeschr.' },
  { value: 'clearlyLimited', label: 'Deutlich eingeschr.' },
  { value: 'painful', label: 'Schmerzhaft' }
];

export const SWELLING_OPTIONS = [
  { value: 0, label: 'Keine' },
  { value: 1, label: 'Leicht' },
  { value: 2, label: 'Deutlich' },
  { value: 3, label: 'Stark' }
] as const;

export const PAIN_LOCATIONS: { value: PainLocation; label: string }[] = [
  { value: 'shin', label: 'Schienbein' },
  { value: 'achilles', label: 'Achillessehne' },
  { value: 'calf', label: 'Wade' },
  { value: 'ankle', label: 'Sprunggelenk' },
  { value: 'foot', label: 'Fuß' },
  { value: 'knee', label: 'Knie' },
  { value: 'scar', label: 'Narbe/OP-Gebiet' },
  { value: 'other', label: 'Andere' }
];

export const STATUS_DE: Record<ExerciseStatus, string> = {
  Initial: 'Neu',
  Learning: 'Lernphase',
  Stable: 'Stabil',
  ProgressionCandidate: 'Progressionskandidat',
  ProgressionApproved: 'Progression freigegeben',
  RegressionRequired: 'Reduziert',
  Paused: 'Pausiert',
  Locked: 'Gesperrt'
};

export const DECISION_DE: Record<DecisionType, string> = {
  progress: 'Steigerung',
  variantChange: 'Neue Variante',
  hold: 'Beibehalten',
  regress: 'Reduktion',
  deload: 'Wiedereinstieg',
  pause: 'Pause',
  stop: 'Stopp',
  locked: 'Gesperrt',
  start: 'Start'
};

export const TEST_DEF: Record<FunctionalTestKey, { label: string; unit: string; hint: string }> = {
  singleLegCalfRaiseAffected: { label: 'Einbeinige Wadenheber – betroffenes Bein', unit: 'Wdh.', hint: 'Maximale saubere Wiederholungen bis zur Ermüdung, Fingerspitzen an der Wand. Nur mit Freigabe für einbeinige Übungen.' },
  singleLegCalfRaiseHealthy: { label: 'Einbeinige Wadenheber – gesundes Bein', unit: 'Wdh.', hint: 'Für den Seitenvergleich.' },
  bilateralCalfRaise: { label: 'Beidbeinige Wadenheber (max.)', unit: 'Wdh.', hint: 'Maximale saubere Wiederholungen.' },
  singleLegStandAffected: { label: 'Einbeinstand – betroffenes Bein', unit: 's', hint: 'Augen offen, fester Untergrund, Stuhl in Reichweite.' },
  kneeToWallAffectedCm: { label: 'Knie-zur-Wand-Test – betroffen', unit: 'cm', hint: 'Abstand Großzehe–Wand, bei dem das Knie die Wand gerade noch berührt (Ferse bleibt am Boden).' },
  painFreeWalkingMin: { label: 'Schmerzfreie Gehzeit', unit: 'min', hint: 'Längste Gehstrecke ohne Schmerzanstieg und mit normalem Gangbild.' },
  hopTestAffectedCm: { label: 'Einbeiniger Weitsprung – betroffen', unit: 'cm', hint: 'Nur mit Sprungfreigabe und nach Anleitung.' },
  hopTestHealthyCm: { label: 'Einbeiniger Weitsprung – gesund', unit: 'cm', hint: 'Für den Seitenvergleich.' }
};
