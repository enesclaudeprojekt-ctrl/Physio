/**
 * TrainingScheduler
 *
 * Erstellt deterministisch den Tagesplan aus Historie, Belastungsprofil,
 * Recovery, Freigaben, funktionellen Voraussetzungen und verfügbarer Zeit.
 * Bei Unsicherheit wird die bisherige Belastung beibehalten oder eine
 * konservativere Einheit gewählt. Es wird keine unnötige Trainingsmenge erzeugt.
 */
import type { DecisionRecord, ExerciseDefinition, ExerciseState, ExerciseStatus, ISODate, Prescription, RecoveryAssessment, TrainingSession } from '../domain/types';
import { availability, type FamilyResult, ExerciseProgressionEngine, freshState } from './exerciseProgressionEngine';
import type { EngineContext } from './context';
import { ExerciseDatabase } from './exerciseDatabase';
import { LoadManagementEngine, REGION_LABEL } from './loadManagementEngine';
import { MedicalRestrictionsEngine } from './medicalRestrictionsEngine';
import { RecoveryAssessmentEngine } from './recoveryAssessmentEngine';
import type { RunningPlan } from './runningProgressionEngine';
import type { GlobalSafety } from './safetyGateEngine';
import { estimateMinutes, formatPrescription } from './prescription';
import { UserProfileEngine } from './userProfileEngine';
import { addDays, daysBetween } from '../utils/date';

export type PlanBlock = 'mobility' | 'foot' | 'calf' | 'strength' | 'balance' | 'endurance' | 'running' | 'sport';

export const BLOCK_LABEL: Record<PlanBlock, string> = {
  mobility: 'Mobilisation',
  foot: 'Fuß & Sprunggelenk',
  calf: 'Wade & Achillessehne',
  strength: 'Kraft',
  balance: 'Gleichgewicht',
  endurance: 'Ausdauer / Gehen',
  running: 'Laufen',
  sport: 'Return to Football'
};

export interface PlanItem {
  exerciseId: string;
  family: string;
  block: PlanBlock;
  prescription: Prescription;
  status: ExerciseStatus;
  explanation: string;
  /** Vorgabe hat sich seit der letzten Ausführung geändert */
  changed: boolean;
  changeType?: DecisionRecord['type'];
  estMinutes: number;
  note?: string;
}

export interface BlockedItem {
  label: string;
  reason: string;
}

export type PlanKind = 'training' | 'recovery' | 'rest' | 'stop' | 'emergency' | 'done';

export interface DailyPlan {
  date: ISODate;
  kind: PlanKind;
  headline: string;
  items: PlanItem[];
  blocked: BlockedItem[];
  notes: string[];
  totalMinutes: number;
  recovery?: RecoveryAssessment;
  /** Einheiten ohne Folgetagsabfrage (neueste zuerst) */
  pendingFollowUps: TrainingSession[];
}

const MOBILITY = ['ankle_mob', 'ankle_df', 'ankle_pf', 'ankle_wb'];
const FOOT = ['foot_arch', 'band_ev', 'toes', 'band_inv', 'gait'];
const STRENGTH_A = ['squat', 'bridge', 'hip_abd', 'hamstring'];
const STRENGTH_B = ['step', 'lunge', 'wall_sit', 'clam', 'hip_ext', 'hip_stab', 'quad'];

const PRIORITY: Record<PlanBlock, number> = { running: 1, calf: 1, endurance: 2, sport: 2, balance: 3, strength: 4, foot: 5, mobility: 6 };

export interface SchedulerInput {
  ctx: EngineContext;
  families: Map<string, FamilyResult>;
  safety: GlobalSafety;
  runningPlan: RunningPlan;
  footballPhase: number;
  date: ISODate;
  availableMinutes?: number;
}

/** Zuletzt bewertete Belastungsreaktion (Einheit + Folgetag) der letzten Tage. */
export function latestRecovery(ctx: EngineContext, date: ISODate): RecoveryAssessment | undefined {
  const recent = [...ctx.completed].reverse().find((s) => s.date < date && daysBetween(s.date, date) <= 3);
  if (!recent) return undefined;
  return RecoveryAssessmentEngine.assess({ session: recent, followUp: ctx.followUpBySession.get(recent.id) });
}

export function pendingFollowUps(ctx: EngineContext, date: ISODate): TrainingSession[] {
  return ctx.completed
    .filter((s) => s.date < date && daysBetween(s.date, date) <= 3 && !ctx.followUpBySession.has(s.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function rotate<T>(arr: T[], offset: number, n: number): T[] {
  if (!arr.length) return [];
  const out: T[] = [];
  for (let i = 0; i < arr.length && out.length < n; i++) out.push(arr[(offset + i) % arr.length]);
  return out;
}

interface Candidate {
  def: ExerciseDefinition;
  state: ExerciseState;
  family: string;
}

export const TrainingScheduler = {
  /** Ermittelt die aktuell planbare Variante einer Familie (oder Sperrgrund). */
  resolveFamily(family: string, input: SchedulerInput): Candidate | { blocked: string } | null {
    const { ctx, families, date } = input;
    const fr = families.get(family);
    const variants = ExerciseDatabase.family(family);
    if (!variants.length) return null;
    if (!fr) return null;
    if (fr.state.paused) return { blocked: `${ExerciseDatabase.require(fr.state.exerciseId).name} ist pausiert.` };
    let def = ExerciseDatabase.require(fr.state.exerciseId);
    let state = fr.state;
    if (!MedicalRestrictionsEngine.canPerform(ctx.profile, def)) {
      // Fallback auf niedrigere, freigegebene Variante
      const lower = variants.filter((v) => v.familyLevel < def.familyLevel && MedicalRestrictionsEngine.canPerform(ctx.profile, v)).pop();
      if (!lower) return { blocked: `${def.name}: Freigabe fehlt (${MedicalRestrictionsEngine.describeMissing(MedicalRestrictionsEngine.missingFor(ctx.profile, def))}).` };
      def = lower;
      state = freshState(lower, UserProfileEngine.initialPrescription(lower, ctx.profile));
    }
    if (fr.untouched) {
      const initial = UserProfileEngine.initialVariant(family, ctx.profile);
      if (!initial) {
        const v0 = variants[0];
        return { blocked: `${v0.name}: Freigabe fehlt (${MedicalRestrictionsEngine.describeMissing(MedicalRestrictionsEngine.missingFor(ctx.profile, v0))}).` };
      }
      // Familien, deren Einstiegsvariante Voraussetzungen hat, erst nach Erfüllung einplanen
      if (initial.familyLevel === 1) {
        const av = availability(initial, ctx, date);
        if (!av.available) return { blocked: `${initial.name}: ${av.missingPrerequisites.map((p) => p.label).join('; ') || 'Voraussetzungen fehlen'}.` };
      }
    }
    return { def, state, family };
  },

  generate(input: SchedulerInput): DailyPlan {
    const { ctx, safety, date, runningPlan } = input;
    const profile = ctx.profile;
    const available = input.availableMinutes ?? profile.availableMinutes;
    const notes: string[] = [];
    const blocked: BlockedItem[] = [];
    const pending = pendingFollowUps(ctx, date);
    const recovery = latestRecovery(ctx, date);
    const base = { date, blocked, notes, pendingFollowUps: pending, recovery };

    // 1) Sicherheit zuerst
    if (safety.level === 'emergency' || safety.level === 'stop') {
      return { ...base, kind: safety.level, headline: safety.level === 'emergency' ? 'Notfall: Sofort Hilfe holen' : 'Training gestoppt – Warnzeichen', items: [], notes: [...safety.messages, 'Sobald die Beschwerden ärztlich abgeklärt sind, kannst du dies in den Einstellungen bzw. im Belastungsprofil bestätigen.'], totalMinutes: 0 };
    }

    // 2) Heute bereits trainiert?
    const today = ctx.completed.filter((s) => s.date === date);
    if (today.length) {
      return { ...base, kind: 'done', headline: 'Heute bereits trainiert', items: [], notes: ['Die heutige Einheit ist dokumentiert. Morgen früh folgt die Rückfrage zur Belastungsreaktion.'], totalMinutes: 0 };
    }

    if (!MedicalRestrictionsEngine.hasAnyClearance(profile)) {
      notes.push('Es ist noch keine medizinische Freigabe dokumentiert. Geplant werden ausschließlich unbelastete Mobilisationsübungen. Bitte trage deine Freigaben in den Einstellungen ein.');
    }
    if (safety.level === 'caution') notes.push(...safety.messages);
    if (pending.length) notes.push('Die Rückmeldung zur letzten Einheit fehlt noch. Ohne Folgetagsdaten wird nicht gesteigert.');

    // 3) Ruhetag-Logik: Wochenziel erreicht?
    const last6 = ctx.completed.filter((s) => s.date < date && daysBetween(s.date, date) <= 6);
    const sessionIndex = ctx.completed.length;
    let kind: PlanKind = 'training';
    if (recovery?.status === 'orange') {
      kind = 'recovery';
      notes.push(`Regenerationseinheit: Die letzte Belastungsreaktion war auffällig (${recovery.findings.join(', ')}). Heute keine Kraft-, Lauf- oder Sprungbelastung.`);
    } else if (last6.length >= profile.sessionsPerWeek) {
      kind = 'rest';
      notes.push(`Du hast in den letzten 7 Tagen bereits ${last6.length} Einheiten absolviert (Ziel: ${profile.sessionsPerWeek}). Heute ist ein Ruhetag mit optionaler Mobilisation vorgesehen.`);
    } else if (last6.length && daysBetween(last6[last6.length - 1].date, date) === 1 && ctx.completed.filter((s) => daysBetween(s.date, date) <= 2 && s.date < date).length >= 2 && profile.sessionsPerWeek <= 5) {
      kind = 'rest';
      notes.push('Du hast an den letzten beiden Tagen trainiert. Heute ist ein Regenerationstag mit optionaler Mobilisation vorgesehen.');
    }
    if (recovery?.status === 'yellow') notes.push(`Leichte Beschwerden nach der letzten Einheit (${recovery.findings.join(', ')}): Belastung wird beibehalten, keine Steigerung, keine Lauf-/Sprungbelastung.`);

    const items: PlanItem[] = [];
    const used = new Set<string>();
    const add = (family: string, block: PlanBlock, opts: { scale?: number; note?: string } = {}): boolean => {
      if (used.has(family)) return false;
      const r = TrainingScheduler.resolveFamily(family, input);
      if (!r) return false;
      if ('blocked' in r) {
        if (['calf', 'endurance', 'running', 'balance'].includes(block)) blocked.push({ label: BLOCK_LABEL[block], reason: r.blocked });
        return false;
      }
      let { def, state } = r;
      const planned = ExerciseProgressionEngine.plannedPrescription(def, state, date);
      let prescription = { ...planned.prescription };
      let explanation = state.lastDecision?.explanation ?? `${def.name}: Einstieg mit ${formatPrescription(prescription)}. Einstiegsvorgabe auf Basis deines Ausgangsstatus.`;
      let note = opts.note;
      if (planned.reduced) explanation = `${def.name}: Seit der letzten Ausführung sind ${planned.gapDays} Tage vergangen – die frühere Vorgabe wird nicht automatisch übernommen. Heute: ${formatPrescription(prescription)}.`;

      // Kumulative Belastung der beanspruchten Regionen
      const reg = LoadManagementEngine.exerciseRegionStatus(ctx.daily, addDays(date, -1), def);
      if (reg.worst === 'spike' && def.loadProfile !== 'mobility') {
        const regionText = reg.regions.map((x) => REGION_LABEL[x]).join(', ');
        if (family === 'calf_raise') {
          blocked.push({ label: def.name, reason: `Belastungsspitze für ${regionText} – heute isometrische Alternative.` });
          used.add(family);
          return add('calf_iso', 'calf', { note: `Deine Trainingsbelastung für ${regionText} war in den letzten Tagen bereits erhöht. Wir planen heute eine alternative Einheit.` });
        }
        if (family === 'walking' && MedicalRestrictionsEngine.isCleared(profile, 'cycling')) {
          used.add(family);
          return add('bike', 'endurance', { note: `Deine Trainingsbelastung für ${regionText} war in den letzten Tagen bereits erhöht. Heute Ergometer statt Gehen.` });
        }
        if (prescription.sets && prescription.sets > 2) prescription = { ...prescription, sets: prescription.sets - 1 };
        else if (prescription.durationSec && def.loadProfile === 'walking') prescription = { ...prescription, durationSec: Math.round((prescription.durationSec * 0.8) / 60) * 60 };
        note = `Belastungsspitze für ${regionText}: Umfang heute reduziert.`;
      } else if (reg.worst === 'elevated' && def.loadProfile !== 'mobility') {
        note = note ?? `Belastung für ${reg.regions.map((x) => REGION_LABEL[x]).join(', ')} ist erhöht – keine Steigerung.`;
      }

      if (opts.scale && opts.scale < 1) {
        if (prescription.durationSec) prescription = { ...prescription, durationSec: Math.max(300, Math.round((prescription.durationSec * opts.scale) / 60) * 60) };
        if (prescription.sets && prescription.sets > 1) prescription = { ...prescription, sets: Math.max(1, Math.round(prescription.sets * opts.scale)) };
      }
      used.add(family);
      const ld = state.lastDecision;
      const changed = !!ld && ['progress', 'variantChange', 'regress', 'deload'].includes(ld.type);
      items.push({
        exerciseId: def.id,
        family,
        block,
        prescription,
        status: state.status,
        explanation,
        changed: changed || planned.reduced,
        changeType: planned.reduced ? 'deload' : ld?.type,
        estMinutes: estimateMinutes(def, prescription),
        note
      });
      return true;
    };

    // 4) Bausteine nach Plantyp
    const mobilityCount = kind === 'training' ? 2 : 3;
    for (const f of rotate(MOBILITY, sessionIndex, MOBILITY.length)) {
      if (items.filter((i) => i.block === 'mobility').length >= mobilityCount) break;
      add(f, 'mobility');
    }

    for (const f of rotate(FOOT, sessionIndex, FOOT.length)) {
      if (items.filter((i) => i.block === 'foot').length >= 1) break;
      if (kind !== 'training' && ExerciseDatabase.family(f)[0].loadProfile !== 'mobility' && ExerciseDatabase.family(f)[0].loadProfile !== 'isometric') continue;
      add(f, 'foot');
    }

    if (kind === 'training') {
      // Wade: Wadenheber nicht an zwei Tagen in Folge → isometrische Alternative
      const calf = input.families.get('calf_raise');
      const calfYesterday = calf?.state.lastPerformed === addDays(date, -1);
      if (calfYesterday) {
        if (!add('calf_iso', 'calf', { note: 'Wadenheber wurden gestern trainiert. Für die Sehnenregeneration heute eine isometrische Alternative.' })) add('calf_raise', 'calf');
      } else if (!add('calf_raise', 'calf')) add('calf_iso', 'calf');

      // Kraft A/B im Wechsel
      const strength = sessionIndex % 2 === 0 ? STRENGTH_A : STRENGTH_B;
      let n = 0;
      for (const f of rotate(strength, Math.floor(sessionIndex / 2), strength.length)) {
        if (n >= 3) break;
        if (add(f, 'strength')) n++;
      }
      if (n < 2) for (const f of [...STRENGTH_A, ...STRENGTH_B]) { if (n >= 2) break; if (add(f, 'strength')) n++; }

      add('balance', 'balance');

      // Laufen / Sport (hohe Stoßbelastung) – nicht bei gelber Recovery
      const highImpactOk = recovery?.status !== 'yellow' && safety.level === 'ok';
      let ranToday = false;
      if (runningPlan.status === 'run' && highImpactOk && runningPlan.exerciseId && runningPlan.prescription) {
        const def = ExerciseDatabase.require(runningPlan.exerciseId);
        items.push({
          exerciseId: def.id,
          family: 'running',
          block: 'running',
          prescription: runningPlan.prescription,
          status: 'Stable',
          explanation: runningPlan.explanation,
          changed: false,
          estMinutes: estimateMinutes(def, runningPlan.prescription)
        });
        ranToday = true;
      } else {
        blocked.push({ label: 'Lauftraining', reason: runningPlan.status === 'run' ? 'Heute kein Lauftraining: leichte Beschwerden bzw. Vorsichtshinweis – Belastung wird nicht erhöht.' : runningPlan.explanation });
      }

      if (profile.goals.includes('football') && input.footballPhase >= 3 && highImpactOk && ranToday) {
        const sportFamilies = ExerciseDatabase.all()
          .filter((e) => e.category === 'sport' && !e.manualOnly && (e.footballPhase ?? 99) <= input.footballPhase)
          .sort((a, b) => (b.footballPhase ?? 0) - (a.footballPhase ?? 0))
          .slice(0, 2)
          .map((e) => e.family);
        for (const f of sportFamilies) add(f, 'sport');
      }

      // Gehen: an Lauftagen entfällt das separate Gehtraining
      if (!ranToday) {
        if (!add('walking', 'endurance') && profile.goals.includes('endurance')) add('bike', 'endurance');
        else if (profile.goals.includes('endurance') && sessionIndex % 3 === 2) add('bike', 'endurance');
      }
    } else {
      // Regeneration / Ruhetag: lockeres, verkürztes Gehen, wenn das Gangbild nicht deutlich verändert ist
      if (!(recovery?.flags.includes('gaitAltered') && recovery.status === 'orange')) add('walking', 'endurance', { scale: 0.6, note: 'Lockerer, verkürzter Spaziergang zur Regeneration (optional).' });
      blocked.push({ label: 'Kraft, Wade, Laufen', reason: kind === 'recovery' ? 'Heute Regeneration nach auffälliger Belastungsreaktion.' : 'Ruhetag – Wochenziel erreicht.' });
    }

    // 5) Zeitbudget einhalten (niedrigste Priorität zuerst entfernen)
    let total = items.reduce((s, i) => s + i.estMinutes, 0);
    if (total > available) {
      const sorted = [...items].sort((a, b) => PRIORITY[b.block] - PRIORITY[a.block]);
      for (const it of sorted) {
        if (total <= available) break;
        if (items.length <= 2) break;
        items.splice(items.indexOf(it), 1);
        total -= it.estMinutes;
        notes.push(`${ExerciseDatabase.require(it.exerciseId).name} entfällt heute wegen der verfügbaren Zeit (${available} min).`);
      }
    }

    const order: PlanBlock[] = ['mobility', 'foot', 'balance', 'calf', 'strength', 'sport', 'running', 'endurance'];
    items.sort((a, b) => order.indexOf(a.block) - order.indexOf(b.block));
    total = items.reduce((s, i) => s + i.estMinutes, 0);

    const headline =
      kind === 'training' ? (items.some((i) => i.block === 'running') ? 'Trainingstag mit Laufeinheit' : 'Trainingstag') : kind === 'recovery' ? 'Regenerationstag' : 'Ruhetag (optionale Mobilisation)';
    return { ...base, kind, headline, items, totalMinutes: total };
  }
};
