/**
 * MedicalRestrictionsEngine
 *
 * Verwaltet dokumentierte ärztliche/physiotherapeutische Freigaben.
 * Grundsatz: Eine Freigabe gilt NUR, wenn sie ausdrücklich als „granted“
 * dokumentiert wurde. Fehlende Angaben werden niemals als Freigabe gewertet.
 */
import type { ClearanceKey, ClearanceMap, ExerciseDefinition, MedicalClearance, UserProfile } from '../domain/types';
import { CLEARANCE_KEYS } from '../domain/types';

export const CLEARANCE_LABEL: Record<ClearanceKey, string> = {
  fullWeightBearing: 'Vollbelastung',
  strengthTraining: 'Krafttraining',
  calfRaises: 'Wadenheber',
  singleLeg: 'Einbeinige Übungen',
  cycling: 'Fahrradfahren',
  jogging: 'Joggen',
  jumping: 'Springen',
  football: 'Fußball'
};

export const CLEARANCE_QUESTION: Record<ClearanceKey, string> = {
  fullWeightBearing: 'Darfst du voll belasten?',
  strengthTraining: 'Darfst du Krafttraining machen?',
  calfRaises: 'Darfst du Wadenheber machen?',
  singleLeg: 'Darfst du einbeinige Übungen machen?',
  cycling: 'Darfst du Fahrrad fahren?',
  jogging: 'Darfst du joggen?',
  jumping: 'Darfst du springen?',
  football: 'Darfst du Fußball spielen?'
};

export function emptyClearances(): ClearanceMap {
  return Object.fromEntries(CLEARANCE_KEYS.map((k) => [k, { key: k, status: 'unknown' } as MedicalClearance])) as ClearanceMap;
}

export const MedicalRestrictionsEngine = {
  isCleared(profile: Pick<UserProfile, 'clearances'>, key: ClearanceKey): boolean {
    return profile.clearances[key]?.status === 'granted';
  },

  isDenied(profile: Pick<UserProfile, 'clearances'>, key: ClearanceKey): boolean {
    return profile.clearances[key]?.status === 'denied';
  },

  missingFor(profile: Pick<UserProfile, 'clearances'>, def: ExerciseDefinition): ClearanceKey[] {
    return def.requiredClearances.filter((k) => !MedicalRestrictionsEngine.isCleared(profile, k));
  },

  canPerform(profile: Pick<UserProfile, 'clearances'>, def: ExerciseDefinition): boolean {
    return MedicalRestrictionsEngine.missingFor(profile, def).length === 0;
  },

  /** Wenn keinerlei Freigabe dokumentiert ist, darf nur Mobilisation ohne Belastung geplant werden. */
  hasAnyClearance(profile: Pick<UserProfile, 'clearances'>): boolean {
    return CLEARANCE_KEYS.some((k) => profile.clearances[k]?.status === 'granted');
  },

  describeMissing(keys: ClearanceKey[]): string {
    return keys.map((k) => CLEARANCE_LABEL[k]).join(', ');
  },

  /** Liste aktiver Einschränkungen für das Dashboard. */
  activeRestrictions(profile: UserProfile): { label: string; detail: string; kind: 'denied' | 'unknown' | 'note' }[] {
    const out: { label: string; detail: string; kind: 'denied' | 'unknown' | 'note' }[] = [];
    for (const k of CLEARANCE_KEYS) {
      const c = profile.clearances[k];
      if (c.status === 'denied') out.push({ label: CLEARANCE_LABEL[k], detail: c.restrictions || 'Nicht freigegeben', kind: 'denied' });
      else if (c.status === 'unknown') out.push({ label: CLEARANCE_LABEL[k], detail: 'Keine Freigabe dokumentiert – gesperrt', kind: 'unknown' });
      else if (c.restrictions) out.push({ label: CLEARANCE_LABEL[k], detail: c.restrictions, kind: 'note' });
    }
    if (profile.generalRestrictions.trim()) out.unshift({ label: 'Allgemein', detail: profile.generalRestrictions.trim(), kind: 'note' });
    return out;
  }
};
