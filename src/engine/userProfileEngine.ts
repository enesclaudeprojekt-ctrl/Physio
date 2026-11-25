/**
 * UserProfileEngine
 *
 * Erstellt Profile, validiert Angaben und leitet aus dem Onboarding einen
 * VORLÄUFIGEN Ausgangsstatus ab. Fehlende Informationen führen nie zu
 * erfundenen Freigaben – die Startvarianten richten sich nach dokumentierter
 * Belastbarkeit UND dokumentierten Freigaben.
 */
import type { ExerciseDefinition, Prescription, UserProfile } from '../domain/types';
import { emptyClearances, MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import { ExerciseDatabase } from './exerciseDatabase';

export function createEmptyProfile(now = new Date().toISOString()): UserProfile {
  return {
    id: 'profile',
    createdAt: now,
    updatedAt: now,
    injury: {
      injuryType: 'Tibia- und Fibulafraktur',
      side: 'right',
      surgeryType: 'Plattenosteosynthese, Schrauben, Tibianagel',
      lastSurgeryType: 'Metallentfernung',
      healingStatus: ''
    },
    clearances: emptyClearances(),
    generalRestrictions: '',
    baseline: {
      walkingMinutes: null,
      painFreeWalking: null,
      briskWalking: null,
      bilateralCalfRaise: null,
      bilateralCalfRaiseReps: null,
      singleLegStand: null,
      singleLegStandSeconds: null,
      ankleMobility: null,
      swelling: null,
      painLevel: null,
      movementLimitations: ''
    },
    goals: ['muscleBuilding', 'calfStrength', 'walking', 'jogging', 'football'],
    availableMinutes: 45,
    sessionsPerWeek: 4,
    onboardingCompleted: false
  };
}

/** Vorgeschlagene Startstufe innerhalb einer Familie anhand der Ausgangsbelastbarkeit. */
function suggestedLevel(family: string, profile: UserProfile): number {
  const b = profile.baseline;
  switch (family) {
    case 'calf_raise':
      if (b.bilateralCalfRaise && (b.bilateralCalfRaiseReps ?? 0) >= 15) return 3;
      if (b.bilateralCalfRaise) return 2;
      return 1;
    case 'balance':
      if (b.singleLegStand && (b.singleLegStandSeconds ?? 0) >= 30) return 4;
      if (b.singleLegStand && (b.singleLegStandSeconds ?? 0) >= 10) return 3;
      if (b.singleLegStand === false) return 1;
      return 1;
    case 'walking':
      return b.briskWalking && b.painFreeWalking && (b.walkingMinutes ?? 0) >= 45 ? 2 : 1;
    default:
      return 1;
  }
}

export const UserProfileEngine = {
  validate(profile: UserProfile): string[] {
    const errors: string[] = [];
    if (!profile.injury.side) errors.push('Betroffenes Bein fehlt.');
    if (profile.availableMinutes < 10 || profile.availableMinutes > 180) errors.push('Verfügbare Trainingszeit muss zwischen 10 und 180 Minuten liegen.');
    if (profile.sessionsPerWeek < 1 || profile.sessionsPerWeek > 7) errors.push('Trainingstage pro Woche: 1–7.');
    for (const c of Object.values(profile.clearances)) {
      if (c.status === 'granted' && !c.date) errors.push(`Freigabe „${c.key}“: Datum fehlt (empfohlen).`);
    }
    return errors;
  },

  /**
   * Startvariante einer Familie: höchste Stufe ≤ vorgeschlagener Stufe,
   * deren Freigaben dokumentiert sind. undefined = gesamte Familie gesperrt.
   */
  initialVariant(family: string, profile: UserProfile): ExerciseDefinition | undefined {
    const variants = ExerciseDatabase.family(family);
    const target = suggestedLevel(family, profile);
    const allowed = variants.filter((v) => v.familyLevel <= Math.max(1, target) && MedicalRestrictionsEngine.canPerform(profile, v));
    return allowed[allowed.length - 1];
  },

  initialPrescription(def: ExerciseDefinition, profile: UserProfile): Prescription {
    const p = { ...def.defaultPrescription };
    const b = profile.baseline;
    if (def.family === 'walking' && b.walkingMinutes) {
      // Einstieg mit ca. 60 % der angegebenen Gehzeit (bei Schmerzen 40 %), 5–30 min, auf 1 min gerundet
      const f = b.painFreeWalking === false ? 0.4 : 0.6;
      const minutes = Math.min(30, Math.max(5, Math.round(b.walkingMinutes * f)));
      p.durationSec = minutes * 60;
    }
    if (def.id === 'bilateral_calf_raise' && b.bilateralCalfRaiseReps) {
      p.reps = b.bilateralCalfRaiseReps >= 20 ? 12 : 10;
    }
    if (def.family === 'balance' && def.familyLevel >= 3 && b.singleLegStandSeconds) {
      p.durationSec = Math.max(10, Math.min(45, Math.round((b.singleLegStandSeconds * 0.6) / 5) * 5));
    }
    return p;
  },

  /** Vorläufiger Ausgangsstatus in Textform (für Onboarding-Zusammenfassung). */
  baselineSummary(profile: UserProfile): { statements: string[]; warnings: string[] } {
    const b = profile.baseline;
    const statements: string[] = [];
    const warnings: string[] = [];
    if (b.walkingMinutes !== null) statements.push(`Gehen: ca. ${b.walkingMinutes} min${b.painFreeWalking ? ' schmerzfrei' : b.painFreeWalking === false ? ' (nicht schmerzfrei)' : ''}.`);
    else warnings.push('Gehzeit nicht angegeben – Gehtraining startet konservativ mit der Standardvorgabe.');
    if (b.bilateralCalfRaise) statements.push(`Beidbeinige Wadenheber möglich${b.bilateralCalfRaiseReps ? ` (${b.bilateralCalfRaiseReps} Wdh.)` : ''}.`);
    else if (b.bilateralCalfRaise === false) statements.push('Beidbeinige Wadenheber derzeit nicht möglich – Start mit sitzender Variante.');
    else warnings.push('Wadenkraft nicht angegeben – Start mit der leichtesten Variante.');
    if (b.singleLegStand) statements.push(`Einbeinstand möglich${b.singleLegStandSeconds ? ` (${b.singleLegStandSeconds} s)` : ''}.`);
    if (b.swelling && b.swelling >= 2) warnings.push('Deutliche Schwellung angegeben – bitte vor Trainingsbeginn ärztlich abklären.');
    if (b.painLevel !== null && b.painLevel >= 5) warnings.push('Deutliche Schmerzen angegeben – bitte vor Trainingsbeginn ärztlich abklären.');

    const cleared = Object.values(profile.clearances).filter((c) => c.status === 'granted');
    if (!cleared.length) warnings.push('Es ist keine Freigabe dokumentiert. Es werden nur unbelastete Mobilisationsübungen geplant.');
    else statements.push(`Dokumentierte Freigaben: ${cleared.length} von 8.`);
    const unknown = Object.values(profile.clearances).filter((c) => c.status === 'unknown').length;
    if (unknown) warnings.push(`${unknown} Freigabe(n) ohne Angabe – diese Bereiche bleiben gesperrt, bis sie dokumentiert sind.`);
    return { statements, warnings };
  }
};
