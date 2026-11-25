/**
 * RecoveryAssessmentEngine
 *
 * Bewertet die Belastungsreaktion einer Einheit (Training + Folgetag) mit
 * einer Ampel (green/yellow/orange/red). Warnsymptome werden unabhängig von
 * jeglichen Scores behandelt und führen immer zu „red“.
 */
import type {
  ExerciseLog,
  FollowUpCheck,
  GaitPattern,
  ReasonCode,
  RecoveryAssessment,
  RecoveryStatus,
  TrainingSession,
  WarningSymptom
} from '../domain/types';
import { RECOVERY_CONFIG } from './config';

export const WARNING_LABEL: Record<WarningSymptom, string> = {
  suddenSharpPain: 'Plötzlicher stechender Schmerz',
  popSensation: 'Knallgefühl / Schnappen',
  suddenStrengthLoss: 'Deutlicher plötzlicher Kraftverlust',
  suspectedAchillesInjury: 'Verdacht auf Achillessehnenverletzung',
  calfSwellingWarmthPain: 'Neue deutliche Wadenschwellung mit Wärme und Schmerz',
  breathlessnessChestPain: 'Atemnot oder Brustschmerzen',
  severeSuddenPain: 'Starker plötzlicher Schmerz'
};

export const STATUS_LABEL: Record<RecoveryStatus, string> = {
  green: 'Gut erholt',
  yellow: 'Leichte Beschwerden',
  orange: 'Deutliche Beschwerden',
  red: 'Warnzeichen'
};

const ORDER: RecoveryStatus[] = ['green', 'yellow', 'orange', 'red'];
export function worse(a: RecoveryStatus, b: RecoveryStatus): RecoveryStatus {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export function gaitSeverity(g: GaitPattern | undefined): number | null {
  if (!g || g === 'notAssessable') return null;
  return { normal: 0, slightlyAltered: 1, clearlyAltered: 2 }[g];
}

export interface AssessmentInput {
  session: TrainingSession;
  /** Optional: einzelne Übung – berücksichtigt Schmerz während der Übung und Bewegungsqualität */
  log?: ExerciseLog;
  followUp?: FollowUpCheck;
}

export const RecoveryAssessmentEngine = {
  assess({ session, log, followUp }: AssessmentInput): RecoveryAssessment {
    let status: RecoveryStatus = 'green';
    const flags = new Set<ReasonCode>();
    const findings: string[] = [];
    const warnings = [...new Set([...(session.warnings ?? []), ...(followUp?.warnings ?? [])])];

    const bump = (s: RecoveryStatus, flag: ReasonCode, text: string) => {
      status = worse(status, s);
      flags.add(flag);
      findings.push(text);
    };

    // 1) Warnsymptome – immer rot, unabhängig vom Rest
    if (warnings.length) {
      for (const w of warnings) bump('red', 'warningSymptom', WARNING_LABEL[w]);
    }

    // 2) Schmerz
    const painValues = [log?.painDuring, session.painAfter, followUp?.pain].filter((x): x is number => typeof x === 'number');
    const maxPain = painValues.length ? Math.max(...painValues) : undefined;
    if (maxPain !== undefined) {
      if (maxPain >= RECOVERY_CONFIG.painRed) bump('red', 'painIncrease', `Starker Schmerz (${maxPain}/10)`);
      else if (maxPain >= RECOVERY_CONFIG.painOrange) bump('orange', 'painIncrease', `Deutlicher Schmerz (${maxPain}/10)`);
      else if (maxPain >= RECOVERY_CONFIG.painYellow) bump('yellow', 'painIncrease', `Moderater Schmerz (${maxPain}/10)`);
    }
    const before = session.painBefore;
    const after = Math.max(session.painAfter ?? -1, followUp?.pain ?? -1);
    if (before !== undefined && after >= RECOVERY_CONFIG.painYellow && after - before >= RECOVERY_CONFIG.painIncreaseDelta) {
      const s: RecoveryStatus = followUp && followUp.pain - before >= RECOVERY_CONFIG.painIncreaseDelta ? 'orange' : 'yellow';
      bump(s, 'painIncrease', `Schmerz gegenüber vor dem Training gestiegen (${before} → ${after})`);
    }

    // 3) Schwellung
    const swelling = Math.max(session.swelling ?? -1, followUp?.swelling ?? -1);
    if (swelling === 3) bump('red', 'swelling', 'Starke oder ungewöhnliche Schwellung');
    else if (swelling === 2) bump('orange', 'swelling', 'Deutliche Schwellung');
    else if (swelling === 1) bump('yellow', 'swelling', 'Leichte Schwellung');

    // 4) Gangbild
    const gait = Math.max(gaitSeverity(session.gait) ?? -1, gaitSeverity(followUp?.gait) ?? -1);
    if (gait === 2) bump('orange', 'gaitAltered', 'Deutlich verändertes Gangbild');
    else if (gait === 1) bump('yellow', 'gaitAltered', 'Leicht verändertes Gangbild');

    // 5) Bewegungsqualität (nur für die einzelne Übung)
    if (log?.movementQuality === 'painful') bump('orange', 'painIncrease', 'Bewegung schmerzhaft');
    else if (log?.movementQuality === 'clearlyLimited') bump('yellow', 'persistentComplaints', 'Bewegung deutlich eingeschränkt');

    // 6) Ermüdung
    const fatigue = log?.rpe ?? session.fatigue;
    if (fatigue !== undefined && fatigue >= 8) bump('yellow', 'persistentComplaints', `Hohe Ermüdung (${fatigue}/10)`);

    // 7) Folgetag
    if (followUp) {
      if (followUp.stiffness >= 3) bump('orange', 'persistentComplaints', 'Starke Steifigkeit am Folgetag');
      else if (followUp.stiffness === 2) bump('yellow', 'persistentComplaints', 'Deutliche Steifigkeit am Folgetag');
      else if (followUp.stiffness === 1) bump('yellow', 'persistentComplaints', 'Leichte Steifigkeit am Folgetag');
      if (followUp.mobility === 'worse') bump('orange', 'mobilityWorse', 'Beweglichkeit am Folgetag verschlechtert');
      if (followUp.overallCapacity <= 3) bump('orange', 'persistentComplaints', 'Allgemeine Belastbarkeit deutlich reduziert');
      else if (followUp.overallCapacity <= 5) bump('yellow', 'persistentComplaints', 'Allgemeine Belastbarkeit reduziert');
      if (followUp.pain >= 4 && (before === undefined || followUp.pain > before)) bump('orange', 'persistentComplaints', `Anhaltende Beschwerden am Folgetag (${followUp.pain}/10)`);
    } else {
      flags.add('followUpMissing');
    }

    if (status === 'green' && followUp) flags.add('followUpUnremarkable');

    return { status, flags: [...flags], warnings, findings, hasFollowUp: !!followUp };
  }
};
