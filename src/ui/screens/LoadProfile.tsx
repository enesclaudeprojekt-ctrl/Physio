import { useState } from 'react';
import type { FunctionalTestKey } from '../../domain/types';
import { useApp } from '../AppState';
import { REGION_LABEL, type RegionLoadStatus } from '../../engine/loadManagementEngine';
import { RUN_STAGES } from '../../engine/runningProgressionEngine';
import { Banner, Empty, Field, Icon, TopBar } from '../components/ui';
import { TEST_DEF } from '../labels';
import { formatDate, todayISO, uid } from '../../utils/date';
import { SafetyBanner } from './shared';

const STATUS_PILL: Record<RegionLoadStatus, { cls: string; label: string }> = {
  none: { cls: '', label: '–' },
  new: { cls: '', label: 'Neu' },
  low: { cls: '', label: 'Niedrig' },
  normal: { cls: 'green', label: 'Normal' },
  elevated: { cls: 'yellow', label: 'Erhöht' },
  spike: { cls: 'red', label: 'Spitze' }
};

export function LoadProfile() {
  const { evaluation: ev, actions, data } = useApp();
  const [testKey, setTestKey] = useState<FunctionalTestKey>('singleLegCalfRaiseAffected');
  const [testVal, setTestVal] = useState('');
  const [testDate, setTestDate] = useState(todayISO());
  if (!ev) return null;
  const rows = ev.regionMatrix;
  const addTest = async () => {
    const v = Number(testVal.replace(',', '.'));
    if (!testVal || Number.isNaN(v) || v < 0) return;
    await actions.saveTest({ id: uid('test'), key: testKey, value: v, date: testDate });
    setTestVal('');
  };
  const confirmPhase = async (phase: number) => {
    if (!confirm(`Bestätigst du, dass Arzt/Physiotherapie die Phase „${ev.football.phases[phase - 1].name}“ ausdrücklich freigegeben hat?`)) return;
    await actions.addAdjustment({ date: todayISO(), action: 'footballPhaseConfirmed', value: phase, note: 'Freigabe durch Arzt/Physiotherapie bestätigt' });
  };

  return (
    <div>
      <TopBar title="Belastungsprofil" sub="Anatomische Belastung, Bereitschaft, Lauf- & Fußballmodul" />
      <SafetyBanner />

      <div className="card">
        <h2>Anatomische Belastungsmatrix</h2>
        <div className="scroll-x">
          <table className="matrix">
            <thead>
              <tr><th>Bereich</th><th>Tag</th><th>7 T</th><th>14 T</th><th>28 T</th><th>Δ</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.region}>
                  <td>{REGION_LABEL[r.region]}</td>
                  <td>{r.day ? r.day.toLocaleString('de-DE') : '–'}</td>
                  <td>{r.d7 ? r.d7.toLocaleString('de-DE') : '–'}</td>
                  <td>{r.d14 ? r.d14.toLocaleString('de-DE') : '–'}</td>
                  <td>{r.d28 ? r.d28.toLocaleString('de-DE') : '–'}</td>
                  <td>{r.changePct === null ? '–' : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`}</td>
                  <td><span className={`pill ${STATUS_PILL[r.status].cls}`}>{STATUS_PILL[r.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny faint">Relative Belastungseinheiten (LE) je Bereich. Δ = letzte 7 Tage gegenüber den 7 Tagen davor. „Erhöht“/„Spitze“ vergleicht die letzte Woche mit dem Wochendurchschnitt der Wochen davor. Vereinfachtes internes Modell – keine Messung der Gewebebelastung.</p>
      </div>

      <div className="card">
        <h2>Funktionelle Bereitschaft</h2>
        <p className="tiny muted">Entscheidungshilfe – erfüllte Kriterien schalten nie allein eine Phase frei. Fehlende Daten gelten als nicht erfüllt.</p>
        {ev.readiness.map((r) => (
          <details key={r.category} className="mt">
            <summary>
              <span className="row between" style={{ display: 'inline-flex', width: 'calc(100% - 20px)' }}>
                <span>{r.label}</span>
                <span className={`pill ${r.status === 'criteriaMet' ? 'green' : r.status === 'locked' ? '' : 'yellow'}`}>
                  {r.status === 'locked' ? <><Icon name="lock" size={12} /> Freigabe fehlt</> : r.status === 'criteriaMet' ? 'Kriterien erfüllt' : 'Noch nicht'}
                </span>
              </span>
            </summary>
            <ul className="list criteria">
              {r.criteria.map((c) => (
                <li key={c.label}>
                  <span className={c.met ? 'ok-ico' : 'no-ico'}><Icon name={c.met ? 'check' : c.met === null ? 'info' : 'x'} size={16} /></span>
                  <span>{c.label}{c.value ? <span className="muted"> – {c.value}</span> : null}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <div className="card">
        <h2>Funktionstests</h2>
        <p className="tiny muted">Regelmäßige Tests verbessern die Entscheidungsgrundlage (z. B. für den Laufbeginn). Nur Tests durchführen, für die eine Freigabe besteht.</p>
        <Field label="Test" hint={TEST_DEF[testKey].hint}>
          <select className="input" value={testKey} onChange={(e) => setTestKey(e.target.value as FunctionalTestKey)}>
            {(Object.keys(TEST_DEF) as FunctionalTestKey[]).map((k) => <option key={k} value={k}>{TEST_DEF[k].label}</option>)}
          </select>
        </Field>
        <div className="grid2">
          <Field label={`Wert (${TEST_DEF[testKey].unit})`}>
            <input className="input" inputMode="decimal" value={testVal} onChange={(e) => setTestVal(e.target.value)} />
          </Field>
          <Field label="Datum">
            <input className="input" type="date" value={testDate} max={todayISO()} onChange={(e) => setTestDate(e.target.value)} />
          </Field>
        </div>
        <button className="btn primary block" onClick={addTest} disabled={!testVal}>Test speichern</button>
        {data.tests.length > 0 && (
          <ul className="list mt">
            {[...data.tests].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
              <li key={t.id} className="row between small">
                <span>{formatDate(t.date)} · {TEST_DEF[t.key].label}: <b>{t.value} {TEST_DEF[t.key].unit}</b></span>
                <button className="btn sm ghost" aria-label="Test löschen" onClick={() => confirm('Test löschen?') && actions.deleteTest(t.id)}><Icon name="x" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Laufmodul</h2>
        <Banner kind={ev.runningPlan.status === 'run' ? 'good' : ev.runningPlan.status === 'locked' ? 'info' : 'warn'}>{ev.runningPlan.explanation}</Banner>
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {RUN_STAGES.map((s, i) => (
            <div key={s.id} className="stat center" style={{ padding: 8, background: ev.running.totalRuns && i === ev.running.stageIndex ? 'var(--accent-soft)' : i < ev.running.stageIndex ? 'var(--surface-3)' : undefined }} title={s.label}>
              <div style={{ fontWeight: 800 }}>{s.id}</div>
            </div>
          ))}
        </div>
        <ul className="plain tiny muted mt">
          {RUN_STAGES.map((s) => <li key={s.id}>{s.id}: {s.label}</li>)}
        </ul>
        <div className="tiny faint">Stufen sind keine zeitliche Vorgabe. Progression frühestens nach zwei gut vertragenen Einheiten auf derselben Stufe (inkl. Folgetag). Ruhetag zwischen Laufeinheiten.</div>
      </div>

      <div className="card">
        <h2>Return to Football</h2>
        <div className="small muted mb">Aktuelle Phase: <b>{ev.football.currentPhase ? `${ev.football.currentPhase}. ${ev.football.phases[ev.football.currentPhase - 1].name}` : 'noch keine'}</b></div>
        {ev.football.phases.map((p) => (
          <details key={p.phase}>
            <summary>
              <span className="row between" style={{ display: 'inline-flex', width: 'calc(100% - 20px)' }}>
                <span>{p.phase}. {p.name}</span>
                <span className={`pill ${p.unlocked ? 'green' : ''}`}>{p.unlocked ? 'Erreicht' : <><Icon name="lock" size={12} /> Gesperrt</>}</span>
              </span>
            </summary>
            <div className="small muted">{p.description}</div>
            <ul className="list criteria">
              {p.criteria.map((c) => (
                <li key={c.label}><span className={c.met ? 'ok-ico' : 'no-ico'}><Icon name={c.met ? 'check' : 'x'} size={16} /></span><span>{c.label}</span></li>
              ))}
            </ul>
            {p.phase >= 10 && !p.criteria.find((c) => c.label.startsWith('Bestätigung'))?.met && (
              <button className="btn sm" onClick={() => confirmPhase(p.phase)}>Freigabe durch Arzt/Physio dokumentieren</button>
            )}
          </details>
        ))}
        {!ev.ctx.profile.goals.includes('football') && <Empty>Fußball ist nicht als Ziel ausgewählt – Sportübungen werden nicht eingeplant.</Empty>}
      </div>
    </div>
  );
}
