import { useRef, useState } from 'react';
import type { GoalKey, UserProfile } from '../../domain/types';
import { CLEARANCE_KEYS } from '../../domain/types';
import { useApp, navigate } from '../AppState';
import { CLEARANCE_QUESTION } from '../../engine/medicalRestrictionsEngine';
import { runCalfRaiseSimulation } from '../../engine/simulation';
import { buildExport, parseImport, sessionsToCSV } from '../../storage/exportImport';
import { Banner, Chips, Field, Seg, Stepper, TopBar } from '../components/ui';
import { GOAL_LABEL } from '../labels';
import { ClearanceEditor } from './ClearanceEditor';
import { todayISO } from '../../utils/date';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings({ sub }: { sub?: string }) {
  if (sub === 'clearances') return <ClearanceSettings />;
  if (sub === 'simulation') return <SimulationView />;
  return <MainSettings />;
}

function MainSettings() {
  const { data, actions } = useApp();
  const [p, setP] = useState<UserProfile>(data.profile!);
  const [msg, setMsg] = useState<{ kind: 'good' | 'danger'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(data.profile);

  const exportJSON = () => download(`rehakompass-sicherung-${todayISO()}.json`, JSON.stringify(buildExport(data), null, 2), 'application/json');
  const exportCSV = () => download(`rehakompass-trainingshistorie-${todayISO()}.csv`, '﻿' + sessionsToCSV(data), 'text/csv;charset=utf-8');
  const onImport = async (file: File) => {
    const res = parseImport(await file.text());
    if (!res.ok) return setMsg({ kind: 'danger', text: `Import fehlgeschlagen: ${res.errors.slice(0, 3).join(' ')}` });
    if (!confirm(`Sicherung importieren (${res.summary})? Alle aktuellen Daten werden ersetzt.`)) return;
    await actions.replaceAll(res.data);
    setP(res.data.profile!);
    setMsg({ kind: 'good', text: `Import erfolgreich: ${res.summary}.` });
  };
  const wipe = async () => {
    if (!confirm('ALLE lokalen Daten (Profil, Trainings, Tests) unwiderruflich löschen?')) return;
    if (!confirm('Wirklich löschen? Erstelle vorher ggf. eine Sicherung.')) return;
    await actions.deleteEverything();
    navigate('dashboard');
  };

  return (
    <div>
      <TopBar title="Einstellungen" />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div className="card">
        <h2>Profil</h2>
        <Field label="Name (optional, nur lokal)">
          <input className="input" value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value || undefined })} />
        </Field>
        <Field label="Betroffenes Bein">
          <Seg value={p.injury.side} options={[{ value: 'left', label: 'Links' }, { value: 'right', label: 'Rechts' }]} onChange={(v) => setP({ ...p, injury: { ...p.injury, side: v } })} />
        </Field>
        <Field label="Heilungsstatus laut Arzt">
          <textarea className="input" value={p.injury.healingStatus} onChange={(e) => setP({ ...p, injury: { ...p.injury, healingStatus: e.target.value } })} />
        </Field>
        <div className="grid2">
          <Stepper label="Zeit pro Einheit (min)" value={p.availableMinutes} step={5} min={10} max={180} onChange={(v) => setP({ ...p, availableMinutes: v })} />
          <Stepper label="Trainingstage / Woche" value={p.sessionsPerWeek} min={1} max={7} onChange={(v) => setP({ ...p, sessionsPerWeek: v })} />
        </div>
        <Field label="Ziele">
          <Chips values={p.goals} options={(Object.keys(GOAL_LABEL) as GoalKey[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))} onChange={(v) => setP({ ...p, goals: v })} />
        </Field>
        <button className="btn primary block" disabled={!dirty} onClick={() => actions.saveProfile(p).then(() => setMsg({ kind: 'good', text: 'Profil gespeichert.' }))}>Speichern</button>
      </div>

      <div className="card">
        <h2>Medizinische Freigaben</h2>
        <p className="small muted">Freigaben mit Datum, Quelle und Einschränkungen dokumentieren. Sie sind verbindliche Grenzen für die Trainingssteuerung.</p>
        <a className="btn block" href="#/settings/clearances">Freigaben bearbeiten</a>
      </div>

      <div className="card">
        <h2>Darstellung</h2>
        <Seg value={data.settings.theme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} onChange={(theme) => actions.saveSettings({ ...data.settings, theme })} />
      </div>

      <div className="card">
        <h2>Daten & Datenschutz</h2>
        <p className="small muted">Alle Daten liegen ausschließlich lokal auf diesem Gerät (IndexedDB). Es findet keine Übertragung an externe Dienste statt. Erstelle regelmäßig eine Sicherung.</p>
        <div className="stack">
          <button className="btn block" onClick={exportJSON}>Datensicherung exportieren (JSON)</button>
          <button className="btn block" onClick={exportCSV}>Trainingshistorie exportieren (CSV)</button>
          <button className="btn block" onClick={() => fileRef.current?.click()}>Sicherung importieren</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <button className="btn danger block" onClick={wipe}>Alle Daten löschen</button>
        </div>
      </div>

      <div className="card">
        <h2>Transparenz</h2>
        <a className="btn block" href="#/settings/simulation">Simulation der Progressionslogik ansehen</a>
        <button className="btn block mt" onClick={() => actions.saveProfile({ ...data.profile!, onboardingCompleted: false })}>Einrichtungsassistent erneut durchlaufen</button>
      </div>

      <div className="card small muted">
        <h2>Über RehaKompass</h2>
        <p>Version 1.0 · offline nutzbar · keine Registrierung · keine Cloud · keine externe KI.</p>
        <p>Diese App ist kein Medizinprodukt, stellt keine Diagnosen und erteilt keine Freigaben. Die Vorgaben deiner behandelnden Ärzt:innen und Physiotherapeut:innen haben Vorrang. Alle Grenzwerte sind technische Startparameter, keine medizinisch validierten Grenzwerte.</p>
        <p>Hinweis zur Folgetagsabfrage: Die Rückfrage erscheint beim Öffnen der App am Folgetag (keine Push-Benachrichtigungen, da keine Serververbindung genutzt wird).</p>
      </div>
    </div>
  );
}

function ClearanceSettings() {
  const { data, actions } = useApp();
  const [p, setP] = useState<UserProfile>(data.profile!);
  const save = async () => {
    await actions.saveProfile(p);
    navigate('settings');
  };
  return (
    <div>
      <TopBar title="Freigaben" back={() => navigate('settings')} />
      <Banner kind="info">Nur ausdrücklich erteilte Freigaben eintragen. Änderungen wirken sofort auf die Trainingsplanung.</Banner>
      {CLEARANCE_KEYS.map((k) => (
        <div className="card" key={k}>
          <h2>{CLEARANCE_QUESTION[k]}</h2>
          <ClearanceEditor value={p.clearances[k]} onChange={(c) => setP({ ...p, clearances: { ...p.clearances, [k]: c } })} />
        </div>
      ))}
      <div className="card">
        <Field label="Allgemeine Einschränkungen">
          <textarea className="input" value={p.generalRestrictions} onChange={(e) => setP({ ...p, generalRestrictions: e.target.value })} />
        </Field>
      </div>
      <div className="sticky-actions">
        <button className="btn primary block lg" onClick={save}>Freigaben speichern</button>
      </div>
    </div>
  );
}

function SimulationView() {
  const rows = runCalfRaiseSimulation();
  return (
    <div>
      <TopBar title="Simulation" sub="Beidbeinige Wadenheber – 5 Einheiten" back={() => navigate('settings')} />
      <p className="small muted">Reproduzierbarer Testfall der Progressionslogik mit fiktiven Daten (wird nicht gespeichert). Identisch mit dem automatisierten Test.</p>
      {rows.map((r) => (
        <div className="card" key={r.unit}>
          <div className="card-head"><h2>Einheit {r.unit}</h2><span className="pill accent">→ {r.newPrescription}</span></div>
          <div className="small"><b>Eingang:</b> {r.input}</div>
          <div className="small"><b>Score:</b> {r.score}/100 · <b>Recovery:</b> {r.recovery} · <b>Belastung:</b> {r.load} LE · <b>Entscheidung:</b> {r.decision}</div>
          <div className="small mt">{r.explanation}</div>
        </div>
      ))}
    </div>
  );
}
