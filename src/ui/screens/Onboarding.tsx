import { useState } from 'react';
import type { ClearanceKey, GoalKey, UserProfile } from '../../domain/types';
import { CLEARANCE_KEYS } from '../../domain/types';
import { createEmptyProfile, UserProfileEngine } from '../../engine/userProfileEngine';
import { CLEARANCE_QUESTION } from '../../engine/medicalRestrictionsEngine';
import { useApp } from '../AppState';
import { Banner, Chips, Field, Icon, Scale, Seg, Stepper } from '../components/ui';
import { GOAL_LABEL } from '../labels';
import { ClearanceEditor } from './ClearanceEditor';
import { todayISO } from '../../utils/date';

const STEPS = ['Willkommen', 'Verletzung', 'Freigaben', 'Belastbarkeit', 'Ziele', 'Ausgangsstatus'];

export function Onboarding() {
  const { actions, data } = useApp();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>(() => data.profile ?? createEmptyProfile());
  const [accepted, setAccepted] = useState(data.settings.disclaimerAccepted);
  const set = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }));
  const setInjury = (patch: Partial<UserProfile['injury']>) => setP((x) => ({ ...x, injury: { ...x.injury, ...patch } }));
  const setBase = (patch: Partial<UserProfile['baseline']>) => setP((x) => ({ ...x, baseline: { ...x.baseline, ...patch } }));
  const yn = (v: boolean | null, on: (v: boolean | null) => void) => (
    <Seg value={v === null ? 'u' : v ? 'y' : 'n'} options={[{ value: 'y', label: 'Ja' }, { value: 'n', label: 'Nein' }, { value: 'u', label: 'Weiß nicht' }]} onChange={(x) => on(x === 'u' ? null : x === 'y')} />
  );

  const finish = async () => {
    await actions.saveSettings({ ...data.settings, disclaimerAccepted: true });
    await actions.saveProfile({ ...p, onboardingCompleted: true });
    location.hash = '#/dashboard';
  };
  const summary = UserProfileEngine.baselineSummary(p);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="sub">Einrichtung · Schritt {step + 1} von {STEPS.length}</div>
          <h1>{STEPS[step]}</h1>
        </div>
      </div>
      <div className="progressbar mb"><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

      {step === 0 && (
        <div className="card">
          <h2>RehaKompass</h2>
          <p className="muted">Adaptive Trainingssteuerung nach operativ versorgter Tibia-/Fibulafraktur – lokal auf deinem Gerät, ohne Konto und ohne Cloud.</p>
          <ul className="plain small">
            <li>Die App erfasst deine Trainings und Belastungsreaktionen und passt den Plan innerhalb klar definierter Sicherheitsgrenzen an.</li>
            <li>Jede Anpassung wird begründet. Es gibt keine Blackbox- oder KI-Entscheidungen.</li>
            <li>Die Phasen richten sich nach deiner Entwicklung – nicht nach dem Kalender.</li>
          </ul>
          <Banner kind="warn" title="Wichtiger Hinweis">
            Diese App ist kein Medizinprodukt und stellt keine Diagnosen. Sie erteilt keine medizinischen Freigaben. Die Vorgaben deiner Ärzt:innen und Physiotherapeut:innen sind verbindlich und haben immer Vorrang. Grenzwerte in der App sind technische Startparameter, keine medizinisch validierten Werte. Bei Warnzeichen (z. B. plötzlicher stechender Schmerz, Knallgefühl, Wadenschwellung mit Wärme, Atemnot, Brustschmerz) sofort ärztliche Hilfe suchen – im Notfall 112.
          </Banner>
          <label className="row mt" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span>Ich habe den Hinweis gelesen und verstanden.</span>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <Field label="Art der Verletzung">
            <input className="input" value={p.injury.injuryType} onChange={(e) => setInjury({ injuryType: e.target.value })} />
          </Field>
          <Field label="Betroffenes Bein">
            <Seg value={p.injury.side} options={[{ value: 'left', label: 'Links' }, { value: 'right', label: 'Rechts' }]} onChange={(v) => setInjury({ side: v })} />
          </Field>
          <Field label="Datum der ursprünglichen Verletzung">
            <input className="input" type="date" max={todayISO()} value={p.injury.injuryDate ?? ''} onChange={(e) => setInjury({ injuryDate: e.target.value || undefined })} />
          </Field>
          <Field label="Art der operativen Versorgung">
            <input className="input" value={p.injury.surgeryType} onChange={(e) => setInjury({ surgeryType: e.target.value })} />
          </Field>
          <Field label="Datum der letzten Operation">
            <input className="input" type="date" max={todayISO()} value={p.injury.lastSurgeryDate ?? ''} onChange={(e) => setInjury({ lastSurgeryDate: e.target.value || undefined })} />
          </Field>
          <Field label="Art der letzten Operation">
            <input className="input" value={p.injury.lastSurgeryType} onChange={(e) => setInjury({ lastSurgeryType: e.target.value })} />
          </Field>
          <Field label="Aktueller Heilungsstatus laut Arzt" hint="z. B. „knöchern konsolidiert, Vollbelastung erlaubt“">
            <textarea className="input" value={p.injury.healingStatus} onChange={(e) => setInjury({ healingStatus: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <>
          <Banner kind="info">Trage nur Freigaben ein, die dir ausdrücklich erteilt wurden. „Unbekannt“ bedeutet: gesperrt, bis du die Freigabe dokumentierst. Die App erfindet keine Freigaben.</Banner>
          {CLEARANCE_KEYS.map((k: ClearanceKey) => (
            <div className="card" key={k}>
              <h2>{CLEARANCE_QUESTION[k]}</h2>
              <ClearanceEditor value={p.clearances[k]} onChange={(c) => set({ clearances: { ...p.clearances, [k]: c } })} />
            </div>
          ))}
          <div className="card">
            <Field label="Welche Einschränkungen bestehen allgemein?">
              <textarea className="input" value={p.generalRestrictions} onChange={(e) => set({ generalRestrictions: e.target.value })} placeholder="z. B. keine Sprünge bis zur nächsten Kontrolle" />
            </Field>
          </div>
        </>
      )}

      {step === 3 && (
        <div className="card">
          <Field label="Wie lange kannst du am Stück gehen? (Minuten)">
            <input className="input" type="number" min={0} max={300} inputMode="numeric" value={p.baseline.walkingMinutes ?? ''} onChange={(e) => setBase({ walkingMinutes: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Kannst du schmerzfrei gehen?">{yn(p.baseline.painFreeWalking, (v) => setBase({ painFreeWalking: v }))}</Field>
          <Field label="Kannst du zügig gehen?">{yn(p.baseline.briskWalking, (v) => setBase({ briskWalking: v }))}</Field>
          <Field label="Kannst du beidbeinige Wadenheber ausführen?">{yn(p.baseline.bilateralCalfRaise, (v) => setBase({ bilateralCalfRaise: v }))}</Field>
          {p.baseline.bilateralCalfRaise && (
            <Field label="Wie viele Wiederholungen schaffst du?">
              <input className="input" type="number" min={0} max={100} inputMode="numeric" value={p.baseline.bilateralCalfRaiseReps ?? ''} onChange={(e) => setBase({ bilateralCalfRaiseReps: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Kannst du auf dem betroffenen Bein stehen?">{yn(p.baseline.singleLegStand, (v) => setBase({ singleLegStand: v }))}</Field>
          {p.baseline.singleLegStand && (
            <Field label="Wie viele Sekunden?">
              <input className="input" type="number" min={0} max={300} inputMode="numeric" value={p.baseline.singleLegStandSeconds ?? ''} onChange={(e) => setBase({ singleLegStandSeconds: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Wie ist deine Sprunggelenksbeweglichkeit?">
            <Seg value={p.baseline.ankleMobility ?? undefined} options={[{ value: 'good', label: 'Gut' }, { value: 'limited', label: 'Eingeschränkt' }, { value: 'veryLimited', label: 'Stark eingeschr.' }]} onChange={(v) => setBase({ ankleMobility: v })} />
          </Field>
          <Field label="Hast du Schwellungen?">
            <Seg value={p.baseline.swelling ?? undefined} options={[{ value: 0, label: 'Keine' }, { value: 1, label: 'Leicht' }, { value: 2, label: 'Deutlich' }, { value: 3, label: 'Stark' }]} onChange={(v) => setBase({ swelling: v as 0 | 1 | 2 | 3 })} />
          </Field>
          <Field label="Wie stark sind deine Schmerzen im Alltag? (0–10)">
            <Scale value={p.baseline.painLevel ?? undefined} onChange={(v) => setBase({ painLevel: v })} labels={['kein Schmerz', 'stärkster']} />
          </Field>
          <Field label="Bewegungseinschränkungen">
            <textarea className="input" value={p.baseline.movementLimitations} onChange={(e) => setBase({ movementLimitations: e.target.value })} placeholder="z. B. Fußheben eingeschränkt" />
          </Field>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <Field label="Trainingsziele">
            <Chips values={p.goals} options={(Object.keys(GOAL_LABEL) as GoalKey[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))} onChange={(v) => set({ goals: v })} />
          </Field>
          <div className="grid2 mt">
            <Stepper label="Zeit pro Einheit (min)" value={p.availableMinutes} step={5} min={10} max={180} onChange={(v) => set({ availableMinutes: v })} />
            <Stepper label="Trainingstage / Woche" value={p.sessionsPerWeek} min={1} max={7} onChange={(v) => set({ sessionsPerWeek: v })} />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="card">
          <h2>Vorläufiger Ausgangsstatus</h2>
          <ul className="plain">
            {summary.statements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {summary.warnings.map((w) => (
            <Banner key={w} kind="warn">{w}</Banner>
          ))}
          <p className="small muted">Der Ausgangsstatus ist vorläufig. Die App passt Vorgaben anhand deiner tatsächlichen Trainingsreaktionen an. Freigaben und Angaben kannst du jederzeit in den Einstellungen ändern.</p>
        </div>
      )}

      <div className="btn-row mt">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            <Icon name="back" size={18} /> Zurück
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button className="btn primary" disabled={step === 0 && !accepted} onClick={() => setStep(step + 1)}>
            Weiter
          </button>
        ) : (
          <button className="btn primary" onClick={finish}>
            Einrichtung abschließen
          </button>
        )}
      </div>
    </div>
  );
}
