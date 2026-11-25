/**
 * DecisionExplanationEngine
 *
 * Erzeugt aus maschinenlesbaren Entscheidungen (DecisionRecord) verständliche
 * deutsche Begründungen. Jede Aussage basiert ausschließlich auf den im
 * Entscheidungskontext gespeicherten, tatsächlich dokumentierten Daten.
 */
import type { AnatomicalRegion, DecisionRecord, ProgressionVariable, ReasonCode } from '../domain/types';
import { ExerciseDatabase } from './exerciseDatabase';
import { formatPrescription, formatVariableValue } from './prescription';
import { REGION_LABEL } from './loadManagementEngine';

export const VARIABLE_ACCUSATIVE: Record<ProgressionVariable, string> = {
  reps: 'die Wiederholungszahl',
  sets: 'die Satzanzahl',
  duration: 'die Dauer',
  hold: 'die Haltezeit',
  weight: 'das Gewicht',
  resistance: 'den Widerstand',
  rom: 'den Bewegungsumfang',
  tempo: 'das Tempo',
  speed: 'die Geschwindigkeit',
  incline: 'die Steigung',
  surface: 'den Untergrund',
  difficulty: 'die Schwierigkeit',
  singleLeg: 'die einbeinige Ausführung',
  explosiveness: 'die Intensität',
  contacts: 'die Anzahl der Bodenkontakte'
};

function regionsText(ctx: DecisionRecord['context']): string {
  const regs = String(ctx.regions ?? '')
    .split(',')
    .filter(Boolean)
    .map((r) => REGION_LABEL[r as AnatomicalRegion] ?? r);
  return regs.length ? regs.join(' und ') : 'die beanspruchten Strukturen';
}

export function reasonSentence(code: ReasonCode, d: DecisionRecord): string | null {
  const c = d.context;
  switch (code) {
    case 'toleratedSessions':
      return Number(c.tolerated) === 1 ? 'Die letzte Einheit wurde gut vertragen.' : `Die letzten ${c.tolerated} Einheiten wurden gut vertragen.`;
    case 'notEnoughTolerated':
      return `Bisher ${c.tolerated ?? 0} von ${c.required} benötigten gut verträglichen Einheiten auf dieser Stufe.`;
    case 'followUpUnremarkable':
      return 'Deine Folgetagsreaktion war unauffällig.';
    case 'followUpMissing':
      return 'Die Rückmeldung vom Folgetag fehlt – ohne sie wird nicht gesteigert.';
    case 'scoreHigh':
      return `Progressionsscore ${d.score?.total ?? '–'}/100.`;
    case 'scoreMaintain':
      return `Progressionsscore ${d.score?.total ?? '–'}/100 – Belastung beibehalten.`;
    case 'scoreReview':
      return `Progressionsscore ${d.score?.total ?? '–'}/100 – Belastung wird überprüft.`;
    case 'scoreLow':
      return `Progressionsscore ${d.score?.total ?? '–'}/100 – keine Progression.`;
    case 'recoveryYellow':
      return `Es gab leichte Beschwerden${d.recovery?.findings.length ? ` (${d.recovery.findings.join(', ')})` : ''}.`;
    case 'recoveryOrange':
      return `Es gab deutliche Beschwerden${d.recovery?.findings.length ? ` (${d.recovery.findings.join(', ')})` : ''}.`;
    case 'recoveryRed':
      return 'Es wurden Warnzeichen oder starke Beschwerden dokumentiert.';
    case 'warningSymptom':
      return 'Ein Warnzeichen ist dokumentiert – die Belastung wird gestoppt. Bitte ärztlich abklären lassen.';
    case 'painIncrease':
      return 'Die Schmerzen haben zugenommen.';
    case 'swelling':
      return 'Nach der letzten Belastung war deine Schwellung erhöht.';
    case 'gaitAltered':
      return 'Das Gangbild war verändert.';
    case 'strengthLoss':
      return 'Die geplante Leistung wurde nicht vollständig erreicht.';
    case 'mobilityWorse':
      return 'Die Beweglichkeit hat sich am Folgetag verschlechtert.';
    case 'recurringShinPain':
      return 'Es wurden wiederholt Schmerzen am Schienbein dokumentiert.';
    case 'persistentComplaints':
      return 'Die Beschwerden halten über mehrere Tage an.';
    case 'missingClearance':
      return `Die medizinische Freigabe für ${c.clearances ?? 'diese Belastung'} ist noch nicht dokumentiert.`;
    case 'missingPrerequisite':
      return `Voraussetzung noch nicht erfüllt: ${c.prerequisite ?? 'funktionelle Kriterien'}.`;
    case 'missingData':
      return `Wichtige Daten fehlen${c.missing ? ` (${c.missing})` : ''} – fehlende Werte werden nicht als positiv gewertet.`;
    case 'regionLoadElevated':
      return `Deine Trainingsbelastung für ${regionsText(c)} war in den letzten Tagen bereits erhöht.`;
    case 'regionLoadSpike':
      return `Für ${regionsText(c)} wurde eine Belastungsspitze erkannt.`;
    case 'ladderMaxed':
      return 'Die Steigerungsmöglichkeiten dieser Variante sind ausgeschöpft.';
    case 'singleVariable':
      return d.changedVariable ? `Wir verändern ausschließlich ${VARIABLE_ACCUSATIVE[d.changedVariable]}.` : null;
    case 'trainingGap':
      return `Seit der letzten Einheit sind ${c.gapDays} Tage vergangen – die frühere Höchstleistung wird nicht automatisch als aktuelle Belastbarkeit übernommen.`;
    case 'conservativeMode':
      return 'Da frühere Steigerungen Beschwerden verursacht haben, wird konservativer gesteigert.';
    case 'efficientMode':
      return 'Du hast mehrere Steigerungen gut vertragen – es sind weniger Bestätigungseinheiten nötig.';
    case 'stagnation':
      return 'Die Belastbarkeit stagniert auf dieser Stufe. Bitte Übung und Ausführung überprüfen; eine andere Progressionsform wird geprüft.';
    case 'setbackAfterProgression':
      return 'Nach der letzten Steigerung traten Beschwerden auf.';
    case 'manualPause':
      return 'Die Übung wurde von dir pausiert.';
    case 'manualRegress':
      return 'Die Vorgabe wurde von dir manuell reduziert.';
    case 'manualReset':
      return 'Die Übung wurde auf die Ausgangsvorgabe zurückgesetzt.';
    case 'restDayRequired':
      return 'Zwischen zwei Laufeinheiten ist mindestens ein Ruhetag vorgesehen.';
    case 'stageLocked':
      return 'Die nächste Stufe ist noch nicht freigeschaltet.';
    case 'firstSession':
      return 'Einstiegsvorgabe für diese Übung.';
  }
  return null;
}

function name(id: string | undefined): string {
  return (id && ExerciseDatabase.get(id)?.name) || 'Übung';
}

export const DecisionExplanationEngine = {
  headline(d: DecisionRecord): string {
    const n = name(d.exerciseId);
    const from = d.changedVariable ? formatVariableValue(d.from, d.changedVariable) : formatPrescription(d.from);
    const to = d.changedVariable ? formatVariableValue(d.to, d.changedVariable) : formatPrescription(d.to);
    switch (d.type) {
      case 'progress':
        return `${n}: Steigerung von ${from} auf ${to}.`;
      case 'variantChange':
        return `Neue Variante: ${name(d.toExerciseId)} statt ${name(d.fromExerciseId)} (Start mit ${formatPrescription(d.to)}).`;
      case 'hold':
        return `${n}: Vorgabe bleibt unverändert bei ${formatPrescription(d.to)}.`;
      case 'regress':
        return `${n}: Reduktion von ${from} auf ${to}.`;
      case 'deload':
        return `${n}: Nach der Pause vorsichtiger Wiedereinstieg mit ${formatPrescription(d.to)}.`;
      case 'pause':
        return `${n}: pausiert.`;
      case 'stop':
        return `${n}: Belastung gestoppt.`;
      case 'locked':
        return `${n}: derzeit gesperrt.`;
      case 'start':
        return `${n}: Einstieg mit ${formatPrescription(d.to)}.`;
    }
  },

  explain(d: DecisionRecord): string {
    const parts = [DecisionExplanationEngine.headline(d)];
    for (const r of d.reasons) {
      const s = reasonSentence(r, d);
      if (s && !parts.includes(s)) parts.push(s);
    }
    return parts.join(' ');
  }
};
