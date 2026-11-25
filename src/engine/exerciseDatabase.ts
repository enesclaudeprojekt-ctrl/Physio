/**
 * ExerciseDatabase – Zugriffsschicht auf die Übungsbibliothek.
 */
import { EXERCISES, EXERCISE_MAP } from '../data/exercises';
import type { ExerciseCategory, ExerciseDefinition } from '../domain/types';

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  footAnkle: 'Fuß & Sprunggelenk',
  calfAchilles: 'Wade & Achillessehne',
  kneeThigh: 'Knie & Oberschenkel',
  hipGlutes: 'Gesäß & Hüfte',
  balance: 'Gleichgewicht',
  endurance: 'Ausdauer',
  running: 'Laufen',
  sport: 'Sport / Fußball'
};

export const ExerciseDatabase = {
  all(): ExerciseDefinition[] {
    return EXERCISES;
  },
  get(id: string): ExerciseDefinition | undefined {
    return EXERCISE_MAP[id];
  },
  require(id: string): ExerciseDefinition {
    const e = EXERCISE_MAP[id];
    if (!e) throw new Error(`Unbekannte Übung: ${id}`);
    return e;
  },
  byCategory(cat: ExerciseCategory): ExerciseDefinition[] {
    return EXERCISES.filter((e) => e.category === cat);
  },
  family(family: string): ExerciseDefinition[] {
    return EXERCISES.filter((e) => e.family === family).sort((a, b) => a.familyLevel - b.familyLevel);
  },
  families(): string[] {
    return [...new Set(EXERCISES.map((e) => e.family))];
  },
  nextVariant(id: string): ExerciseDefinition | undefined {
    const e = EXERCISE_MAP[id];
    if (!e) return undefined;
    return ExerciseDatabase.family(e.family).find((x) => x.familyLevel === e.familyLevel + 1);
  },
  previousVariant(id: string): ExerciseDefinition | undefined {
    const e = EXERCISE_MAP[id];
    if (!e) return undefined;
    return ExerciseDatabase.family(e.family).find((x) => x.familyLevel === e.familyLevel - 1);
  },
  search(q: string): ExerciseDefinition[] {
    const s = q.trim().toLowerCase();
    if (!s) return EXERCISES;
    return EXERCISES.filter((e) => e.name.toLowerCase().includes(s) || e.description.toLowerCase().includes(s) || e.muscles.some((m) => m.toLowerCase().includes(s)));
  }
};
