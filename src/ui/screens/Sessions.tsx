import { useState } from 'react';
import type { FollowUpCheck, PainLocation, TrainingSession, WarningSymptom } from '../../domain/types';
import { WARNING_SYMPTOMS } from '../../domain/types';
import { useApp, navigate } from '../AppState';
import { ExerciseDatabase } from '../../engine/exerciseDatabase';
import { formatPrescription, prescriptionEquals } from '../../engine/prescription';
import { LoadManagementEngine } from '../../engine/loadManagementEngine';
import { RecoveryAssessmentEngine, WARNING_LABEL } from '../../engine/recoveryAssessmentEngine';
import { Banner, Chips, Empty, Field, Icon, Scale, Seg, StatusPill, TopBar } from '../components/ui';
import { DECISION_DE, GAIT_LABEL, GAIT_OPTIONS, PAIN_LOCATIONS, SWELLING_OPTIONS } from '../labels';
import { formatDate, todayISO, uid } from '../../utils/date';

function useSession(id: string): TrainingSession | undefined {
  return useApp().data.sessions.find((s) => s.id === id);
}

function DecisionList({ sessionId }: { sessionId: string }) {
  const { evaluation: ev } = useApp();
  if (!ev) return null;
  const decs = ev.decisions.filter((d) => d.sessionId === sessionId);
  if (!decs.length) return <Empty>Keine Entscheidungen für diese Einheit.</Empty>;
  return (
    <ul className="list">
      {decs.map((d) => (
        <li key={d.id}>
          <div className="row between">
            <b className="small">{ExerciseDatabase.get(d.exerciseId)?.name}</b>
            <span className={`pill ${d.type === 'progress' || d.type === 'variantChange' ? 'accent' : d.type === 'regress' || d.type === 'stop' ? 'orange' : ''}`}>{DECISION_DE[d.type]}</span>
          </div>
          <div className="small mt">{d.explanation}</div>
          {d.score && (
            <details className="tiny muted">
              <summary>Score {d.score.total}/100 · Belastung {d.load?.toLocaleString('de-DE')} LE</summary>
              <ul className="plain">
                {d.score.components.map((c) => (
                  <li key={c.key}>{c.label}: {c.normalized === null ? 'fehlt (0 Punkte)' : `${c.points} / ${c.weight}`}</li>
                ))}
              </ul>
              <div>Neue Vorgabe: {formatPrescription(d.to)}</div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Summary({ id }: { id: string }) {
  const s = useSession(id);
  if (!s) return <Empty>Einheit nicht gefunden.</Empty>;
  const load = LoadManagementEngine.sessionLoad(s);
  const pre = RecoveryAssessmentEngine.assess({ session: s });
  const done = s.exercises.filter((e) => e.completed);
  return (
    <div>
      <TopBar title="Zusammenfassung" sub={formatDate(s.date)} />
      {s.warnings.length > 0 ? (
        <Banner kind="danger" title="Warnzeichen dokumentiert">Das Training ist gestoppt. Bitte lass die Beschwerden ärztlich abklären. {s.warnings.includes('breathlessnessChestPain') && 'Bei Atemnot oder Brustschmerzen sofort 112 anrufen.'}</Banner>
      ) : (
        <Banner kind="good" title="Einheit gespeichert">Morgen früh fragt dich die App: „Wie hat dein Bein auf die gestrige Belastung reagiert?“ Erst danach wird über Steigerungen entschieden.</Banner>
      )}
      <div className="grid3">
        <div className="stat"><div className="label">Übungen</div><div className="value">{done.length}<span className="unit">/ {s.exercises.length}</span></div></div>
        <div className="stat"><div className="label">Belastung</div><div className="value">{load.total.toLocaleString('de-DE')}<span className="unit">LE</span></div></div>
        <div className="stat"><div className="label">Vorläufig</div><div className="mt"><StatusPill status={pre.status} /></div></div>
      </div>
      <div className="card">
        <h2>Übungen</h2>
        <ul className="list">
          {s.exercises.map((e, i) => (
            <li key={i} className="row between">
              <div className="grow">
                <div className="small"><b>{ExerciseDatabase.get(e.exerciseId)?.name}</b></div>
                <div className="tiny muted">{e.skipped ? 'Übersprungen' : `${formatPrescription(e.actual)}${!prescriptionEquals(e.planned, e.actual) ? ` (geplant: ${formatPrescription(e.planned)})` : ''}`}</div>
              </div>
              {!e.skipped && <span className="tiny muted">Schmerz {e.painDuring ?? '–'}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Vorläufige Bewertung</h2>
        <DecisionList sessionId={s.id} />
      </div>
      <button className="btn primary block lg" onClick={() => navigate('dashboard')}>Zur Übersicht</button>
    </div>
  );
}

export function FollowUp({ sessionId }: { sessionId: string }) {
  const { data, actions } = useApp();
  const s = data.sessions.find((x) => x.id === sessionId);
  const existing = data.followUps.find((f) => f.sessionId === sessionId);
  const [pain, setPain] = useState<number | undefined>(existing?.pain);
  const [swelling, setSwelling] = useState<0 | 1 | 2 | 3 | undefined>(existing?.swelling);
  const [stiffness, setStiffness] = useState<0 | 1 | 2 | 3>(existing?.stiffness ?? 0);
  const [gait, setGait] = useState(existing?.gait);
  const [mobility, setMobility] = useState(existing?.mobility ?? 'same');
  const [capacity, setCapacity] = useState<number>(existing?.overallCapacity ?? 7);
  const [locs, setLocs] = useState<PainLocation[]>(existing?.painLocations ?? []);
  const [warn, setWarn] = useState<WarningSymptom[]>(existing?.warnings ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  if (!s) return <Empty>Einheit nicht gefunden.</Empty>;
  const ok = pain !== undefined && swelling !== undefined && gait !== undefined;
  const submit = async () => {
    const f: FollowUpCheck = { id: existing?.id ?? uid('fu'), sessionId, date: existing?.date ?? todayISO(), pain: pain!, swelling: swelling!, stiffness, gait: gait!, mobility, overallCapacity: capacity, painLocations: locs, warnings: warn, notes: notes || undefined };
    await actions.saveFollowUp(f);
    navigate('today');
  };
  return (
    <div>
      <TopBar title="Folgetag-Check" sub={`Einheit vom ${formatDate(s.date, { weekday: 'long', day: '2-digit', month: '2-digit' })}`} back={() => history.back()} />
      <div className="card">
        <h2>Wie hat dein Bein auf die gestrige Belastung reagiert?</h2>
        <Field label="Schmerzen heute (0–10)">
          <Scale value={pain} onChange={setPain} labels={['kein', 'stärkster']} />
        </Field>
        <Field label="Schwellung">
          <Seg value={swelling} options={SWELLING_OPTIONS.map((o) => ({ ...o }))} onChange={(v) => setSwelling(v as 0 | 1 | 2 | 3)} />
        </Field>
        <Field label="Steifigkeit">
          <Seg value={stiffness} options={[{ value: 0, label: 'Keine' }, { value: 1, label: 'Leicht' }, { value: 2, label: 'Deutlich' }, { value: 3, label: 'Stark' }]} onChange={(v) => setStiffness(v as 0 | 1 | 2 | 3)} />
        </Field>
        <Field label="Gangbild">
          <Seg value={gait} options={GAIT_OPTIONS.map((o) => ({ ...o, label: o.label.replace('verändert', 'veränd.').replace('Nicht beurteilbar', 'n. beurteilb.') }))} onChange={setGait} />
        </Field>
        <Field label="Beweglichkeit im Vergleich zu gestern">
          <Seg value={mobility} options={[{ value: 'better', label: 'Besser' }, { value: 'same', label: 'Gleich' }, { value: 'worse', label: 'Schlechter' }]} onChange={setMobility} />
        </Field>
        <Field label="Allgemeine Belastbarkeit heute (0 = sehr schlecht, 10 = sehr gut)">
          <Scale value={capacity} onChange={setCapacity} />
        </Field>
        <Field label="Schmerzort (optional)">
          <Chips values={locs} options={PAIN_LOCATIONS} onChange={setLocs} />
        </Field>
        <Field label="Warnzeichen?">
          <Chips values={warn} options={WARNING_SYMPTOMS.map((w) => ({ value: w, label: WARNING_LABEL[w] }))} onChange={setWarn} tone="bad" />
        </Field>
        {warn.includes('breathlessnessChestPain') && <Banner kind="danger" title="Notfall">Bei Atemnot oder Brustschmerzen sofort 112 anrufen.</Banner>}
        <Field label="Notiz (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button className="btn primary block lg" disabled={!ok} onClick={submit}>Speichern</button>
      </div>
    </div>
  );
}

export function History() {
  const { evaluation: ev, data } = useApp();
  const sessions = [...data.sessions].filter((s) => s.status === 'completed').sort((a, b) => (a.date === b.date ? b.startedAt.localeCompare(a.startedAt) : b.date.localeCompare(a.date)));
  return (
    <div>
      <TopBar title="Trainingshistorie" sub={`${sessions.length} Einheiten`} />
      {!sessions.length && <Empty>Noch keine Einheiten dokumentiert.</Empty>}
      <div className="card" style={{ display: sessions.length ? undefined : 'none' }}>
        <ul className="list">
          {sessions.map((s) => {
            const f = ev?.ctx.followUpBySession.get(s.id);
            const a = RecoveryAssessmentEngine.assess({ session: s, followUp: f });
            return (
              <li key={s.id}>
                <button className="list-btn" onClick={() => navigate(`history/${s.id}`)}>
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>{formatDate(s.date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                    <div className="tiny muted">{s.exercises.filter((e) => !e.skipped).length} Übungen · {LoadManagementEngine.sessionLoad(s).total.toLocaleString('de-DE')} LE · {f ? 'Folgetag erfasst' : 'Folgetag offen'}</div>
                  </div>
                  <StatusPill status={a.status} />
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const { evaluation: ev, actions } = useApp();
  const s = useSession(id);
  if (!s) return <Empty>Einheit nicht gefunden.</Empty>;
  const f = ev?.ctx.followUpBySession.get(s.id);
  const a = RecoveryAssessmentEngine.assess({ session: s, followUp: f });
  const del = async () => {
    if (!confirm('Diese Einheit endgültig löschen? Alle davon abhängigen Entscheidungen werden neu berechnet.')) return;
    await actions.deleteSession(s.id);
    navigate('history');
  };
  return (
    <div>
      <TopBar title={formatDate(s.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} back={() => navigate('history')} />
      <div className="card">
        <div className="card-head"><h2>Belastungsreaktion</h2><StatusPill status={a.status} /></div>
        {a.findings.length ? <ul className="plain small">{a.findings.map((x) => <li key={x}>{x}</li>)}</ul> : <div className="small muted">Keine Auffälligkeiten dokumentiert.</div>}
        <div className="grid2 small mt">
          <div>Schmerz vorher/nachher: <b>{s.painBefore ?? '–'} / {s.painAfter ?? '–'}</b></div>
          <div>Schwellung: <b>{s.swelling ?? '–'}</b></div>
          <div>Gangbild: <b>{s.gait ? GAIT_LABEL[s.gait] : '–'}</b></div>
          <div>Ermüdung: <b>{s.fatigue ?? '–'}</b></div>
        </div>
        {s.warnings.length > 0 && <Banner kind="danger">Warnzeichen: {s.warnings.map((w) => WARNING_LABEL[w]).join(', ')}</Banner>}
        {s.notes && <p className="small">Notiz: {s.notes}</p>}
        <hr className="sep" />
        {f ? (
          <div className="small">
            <b>Folgetag ({formatDate(f.date)}):</b> Schmerz {f.pain}/10 · Schwellung {f.swelling} · Steifigkeit {f.stiffness} · Gang {GAIT_LABEL[f.gait]} · Beweglichkeit {f.mobility === 'better' ? 'besser' : f.mobility === 'worse' ? 'schlechter' : 'gleich'} · Belastbarkeit {f.overallCapacity}/10
            <div><a href={`#/followup/${s.id}`}>Bearbeiten</a></div>
          </div>
        ) : (
          <a className="btn sm" href={`#/followup/${s.id}`}>Folgetag nachtragen</a>
        )}
      </div>
      <div className="card">
        <h2>Übungen</h2>
        <ul className="list">
          {s.exercises.map((e, i) => (
            <li key={i}>
              <b className="small">{ExerciseDatabase.get(e.exerciseId)?.name}</b>
              <div className="tiny muted">
                {e.skipped ? 'Übersprungen' : <>Tatsächlich: {formatPrescription(e.actual)} · Geplant: {formatPrescription(e.planned)} · Schmerz {e.painDuring ?? '–'} · RPE {e.rpe ?? '–'} · Qualität {e.movementQuality ?? '–'}</>}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Entscheidungen</h2>
        <DecisionList sessionId={s.id} />
      </div>
      <button className="btn danger block" onClick={del}>Einheit löschen</button>
    </div>
  );
}
