/**
 * SafetyGateEngine – höchste Priorität.
 *
 * Wird vor jeder Progressionsentscheidung ausgeführt. Warnsymptome und
 * fehlende Freigaben können durch keinen Score relativiert werden.
 * Die Engine stellt KEINE Diagnosen, sondern gibt Handlungsempfehlungen.
 */
import type {
  AnatomicalRegion,
  ExerciseDefinition,
  FollowUpCheck,
  ISODate,
  ManualAdjustment,
  ReasonCode,
  RecoveryAssessment,
  ScoreBreakdown,
  TrainingSession,
  UserProfile,
  WarningSymptom
} from '../domain/types';
import { RECOVERY_CONFIG } from './config';
import { MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import type { RegionLoadStatus } from './loadManagementEngine';
import { WARNING_LABEL } from './recoveryAssessmentEngine';
import { daysBetween } from '../utils/date';

export type GlobalSafetyLevel = 'ok' | 'caution' | 'stop' | 'emergency';

export interface ActiveWarning {
  symptom: WarningSymptom;
  date: ISODate;
  source: 'session' | 'followUp';
}

export interface GlobalSafety {
  level: GlobalSafetyLevel;
  activeWarnings: ActiveWarning[];
  messages: string[];
  recurringShinPain: boolean;
  persistentComplaints: boolean;
}

export const EMERGENCY_TEXT = 'Bei Atemnot oder Brustschmerzen sofort den Notruf 112 wählen bzw. die Notfallversorgung aufsuchen.';
export const CALF_TEXT = 'Training stoppen. Bei neuer deutlicher Wadenschwellung mit Wärme und Schmerzen wird eine zeitnahe ärztliche Abklärung empfohlen.';
export const STOP_TEXT = 'Belastung sofort stoppen. Keine Ersatzbelastung für die betroffene Struktur. Eine ärztliche Untersuchung wird empfohlen.';

export interface SafetyInput {
  profile: UserProfile;
  sessions: TrainingSession[];
  followUps: FollowUpCheck[];
  adjustments: ManualAdjustment[];
  date: ISODate;
}

/** Datum der letzten Bestätigung „Warnzeichen ärztlich abgeklärt“. */
function lastClearance(adjustments: ManualAdjustment[], date: ISODate): string | undefined {
  return adjustments
    .filter((a) => a.action === 'warningCleared' && a.date <= date)
    .map((a) => a.createdAt)
    .sort()
    .pop();
}

export const SafetyGateEngine = {
  activeWarnings({ sessions, followUps, adjustments, date }: SafetyInput): ActiveWarning[] {
    const cleared = lastClearance(adjustments, date);
    const out: ActiveWarning[] = [];
    for (const s of sessions) {
      if (s.date > date || !s.warnings?.length) continue;
      const ts = s.completedAt ?? s.startedAt;
      if (cleared && ts <= cleared) continue;
      if (daysBetween(s.date, date) > RECOVERY_CONFIG.warningActiveDays) continue;
      for (const w of s.warnings) out.push({ symptom: w, date: s.date, source: 'session' });
    }
    for (const f of followUps) {
      if (f.date > date || !f.warnings?.length) continue;
      if (cleared && `${f.date}T23:59:59` <= cleared) continue;
      for (const w of f.warnings) out.push({ symptom: w, date: f.date, source: 'followUp' });
    }
    return out;
  },

  /** Wiederkehrende Schienbeinschmerzen in den letzten Einträgen (Training + Folgetag). */
  recurringShinPain(sessions: TrainingSession[], followUps: FollowUpCheck[], date: ISODate): boolean {
    const entries = [
      ...sessions.filter((s) => s.date <= date && s.status !== 'draft').map((s) => ({ d: s.date, loc: s.painLocations ?? [] })),
      ...followUps.filter((f) => f.date <= date).map((f) => ({ d: f.date, loc: f.painLocations ?? [] }))
    ]
      .sort((a, b) => (a.d < b.d ? 1 : -1))
      .slice(0, RECOVERY_CONFIG.shinPainWindowEntries);
    return entries.filter((e) => e.loc.includes('shin')).length >= RECOVERY_CONFIG.shinPainThreshold;
  },

  /** Anhaltende Beschwerden: die letzten drei Folgetagsabfragen jeweils ≥ 3/10. */
  persistentComplaints(followUps: FollowUpCheck[], date: ISODate): boolean {
    const last = followUps.filter((f) => f.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
    return last.length === 3 && last.every((f) => f.pain >= 3);
  },

  global(input: SafetyInput): GlobalSafety {
    const activeWarnings = SafetyGateEngine.activeWarnings(input);
    const messages: string[] = [];
    let level: GlobalSafetyLevel = 'ok';
    const symptoms = new Set(activeWarnings.map((w) => w.symptom));
    if (symptoms.has('breathlessnessChestPain')) {
      level = 'emergency';
      messages.push(EMERGENCY_TEXT);
    }
    if (symptoms.has('calfSwellingWarmthPain')) {
      if (level !== 'emergency') level = 'stop';
      messages.push(CALF_TEXT);
    }
    const others = [...symptoms].filter((s) => s !== 'breathlessnessChestPain' && s !== 'calfSwellingWarmthPain');
    if (others.length) {
      if (level === 'ok') level = 'stop';
      messages.push(`${others.map((s) => WARNING_LABEL[s]).join(', ')}: ${STOP_TEXT}`);
    }
    const recurringShinPain = SafetyGateEngine.recurringShinPain(input.sessions, input.followUps, input.date);
    const persistentComplaints = SafetyGateEngine.persistentComplaints(input.followUps, input.date);
    if (level === 'ok' && (recurringShinPain || persistentComplaints)) {
      level = 'caution';
      if (recurringShinPain) messages.push('Wiederkehrende Schmerzen am Schienbein dokumentiert: keine Steigerung schienbeinbelastender Übungen. Bitte ärztlich/physiotherapeutisch abklären lassen.');
      if (persistentComplaints) messages.push('Anhaltende Beschwerden an mehreren Folgetagen: keine Progression. Bitte Rücksprache mit Arzt/Physiotherapie halten.');
    }
    return { level, activeWarnings, messages, recurringShinPain, persistentComplaints };
  },

  /**
   * Prüft, ob eine Progression zulässig ist. Alle Bedingungen müssen erfüllt sein.
   */
  checkProgression(p: {
    profile: UserProfile;
    target: ExerciseDefinition;
    recovery: RecoveryAssessment;
    score: ScoreBreakdown;
    regionStatus: { worst: RegionLoadStatus; regions: AnatomicalRegion[] };
    global: Pick<GlobalSafety, 'level' | 'recurringShinPain' | 'persistentComplaints'>;
    strengthLoss: boolean;
  }): { allowed: boolean; reasons: ReasonCode[]; context: Record<string, string> } {
    const reasons: ReasonCode[] = [];
    const context: Record<string, string> = {};
    if (p.global.level === 'stop' || p.global.level === 'emergency' || p.recovery.warnings.length) reasons.push('warningSymptom');
    if (p.recovery.status === 'red') reasons.push('recoveryRed');
    else if (p.recovery.status === 'orange') reasons.push('recoveryOrange');
    else if (p.recovery.status === 'yellow') reasons.push('recoveryYellow');
    if (!p.recovery.hasFollowUp) reasons.push('followUpMissing');
    const critical = ['Schmerz', 'Schwellung', 'Gangbild'];
    if (p.score.missing.some((m) => critical.includes(m))) {
      reasons.push('missingData');
      context.missing = p.score.missing.join(', ');
    }
    if (p.score.band !== 'progress') reasons.push(p.score.band === 'maintain' ? 'scoreMaintain' : p.score.band === 'review' ? 'scoreReview' : 'scoreLow');
    const missingClearances = MedicalRestrictionsEngine.missingFor(p.profile, p.target);
    if (missingClearances.length) {
      reasons.push('missingClearance');
      context.clearances = MedicalRestrictionsEngine.describeMissing(missingClearances);
    }
    if (p.regionStatus.worst === 'spike') reasons.push('regionLoadSpike');
    else if (p.regionStatus.worst === 'elevated') reasons.push('regionLoadElevated');
    if (p.regionStatus.regions.length) context.regions = p.regionStatus.regions.join(',');
    if (p.global.recurringShinPain && (p.target.regions.tibia ?? 0) >= 0.3) reasons.push('recurringShinPain');
    if (p.global.persistentComplaints) reasons.push('persistentComplaints');
    if (p.strengthLoss) reasons.push('strengthLoss');
    if (p.recovery.flags.includes('mobilityWorse')) reasons.push('mobilityWorse');
    if (p.recovery.flags.includes('gaitAltered')) reasons.push('gaitAltered');
    return { allowed: reasons.length === 0, reasons: [...new Set(reasons)], context };
  }
};
