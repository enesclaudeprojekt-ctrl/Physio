import { useState } from 'react';
import type { ExerciseCategory } from '../../domain/types';
import { useApp, navigate } from '../AppState';
import { CATEGORY_LABEL, ExerciseDatabase } from '../../engine/exerciseDatabase';
import { availability } from '../../engine/exerciseProgressionEngine';
import { CLEARANCE_LABEL } from '../../engine/medicalRestrictionsEngine';
import { REGION_LABEL } from '../../engine/loadManagementEngine';
import { formatPrescription } from '../../engine/prescription';
import { VARIABLE_LABEL } from '../../engine/prescription';
import { ExerciseIllustration } from '../components/ExerciseIllustration';
import { Empty, Icon, TopBar } from '../components/ui';
import { DECISION_DE, STATUS_DE } from '../labels';
import { formatDate, todayISO } from '../../utils/date';
import type { AnatomicalRegion } from '../../domain/types';

export function Library() {
  const { evaluation: ev } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExerciseCategory | 'all'>('all');
  if (!ev) return null;
  const list = ExerciseDatabase.search(q).filter((e) => cat === 'all' || e.category === cat);
  return (
    <div>
      <TopBar title="Übungsbibliothek" sub={`${ExerciseDatabase.all().length} Übungen`} />
      <input className="input" placeholder="Übung oder Muskel suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Suche" />
      <div className="chips mt" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {(['all', ...Object.keys(CATEGORY_LABEL)] as (ExerciseCategory | 'all')[]).map((c) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} style={{ whiteSpace: 'nowrap' }} onClick={() => setCat(c)}>
            {c === 'all' ? 'Alle' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="card">
        {!list.length && <Empty>Keine Übung gefunden.</Empty>}
        <ul className="list">
          {list.map((e) => {
            const av = availability(e, ev.ctx);
            const fam = ev.familyStates.get(e.family);
            const current = fam?.exerciseId === e.id && !ev.families.get(e.family)?.untouched;
            return (
              <li key={e.id}>
                <button className="list-btn" onClick={() => navigate(`library/${e.id}`)}>
                  <div className="exthumb"><ExerciseIllustration illustration={e.illustration} title={e.name} /></div>
                  <div className="grow">
                    <div className="exname">{e.name}</div>
                    <div className="exmeta">{CATEGORY_LABEL[e.category]} · Stufe {e.difficulty}/5</div>
                    <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                      {current && <span className="pill accent">Aktuell</span>}
                      {av.missingClearances.length > 0 && <span className="pill"><Icon name="lock" size={12} /> Freigabe fehlt</span>}
                      {av.missingClearances.length === 0 && av.missingPrerequisites.length > 0 && <span className="pill">Voraussetzung offen</span>}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const { evaluation: ev, actions } = useApp();
  const e = ExerciseDatabase.get(id);
  if (!e || !ev) return <Empty>Übung nicht gefunden.</Empty>;
  const av = availability(e, ev.ctx);
  const fr = ev.families.get(e.family);
  const isCurrent = fr && fr.state.exerciseId === e.id && !fr.untouched;
  const decs = fr ? fr.decisions.filter((d) => d.exerciseId === e.id).slice(-5).reverse() : [];
  const variants = ExerciseDatabase.family(e.family);
  const adj = (action: 'pause' | 'resume' | 'regress' | 'reset') => actions.addAdjustment({ date: todayISO(), action, exerciseId: e.id });
  const p = e.defaultPrescription;

  return (
    <div>
      <TopBar title={e.name} sub={CATEGORY_LABEL[e.category]} back={() => history.back()} />
      <div className="hero-ill"><ExerciseIllustration illustration={e.illustration} title={e.name} /></div>
      <div className="tiny faint mt">Schematische, selbst erstellte Darstellung (blass = Ausgangsposition, farbig = betroffenes Bein).</div>
      <p>{e.description}</p>

      {(av.missingClearances.length > 0 || av.missingPrerequisites.length > 0) && (
        <div className="banner warn">
          <Icon name="lock" size={18} />
          <div className="small">
            {av.missingClearances.length > 0 && <div><b>Gesperrt:</b> Freigabe fehlt – {av.missingClearances.map((k) => CLEARANCE_LABEL[k]).join(', ')}.</div>}
            {av.missingPrerequisites.map((m) => <div key={m.label}>Voraussetzung: {m.label}</div>)}
          </div>
        </div>
      )}

      {isCurrent && fr && (
        <div className="card accent">
          <div className="card-head"><h2>Dein aktueller Stand</h2><span className="pill accent">{STATUS_DE[fr.state.status]}</span></div>
          <div style={{ fontSize: 22, fontWeight: 750 }}>{formatPrescription(fr.state.current)}</div>
          <div className="small muted">Verträgliche Einheiten auf dieser Stufe: {fr.state.toleratedAtLevel} · Einheiten gesamt: {fr.state.totalSessions}{fr.state.conservativeLevel ? ' · konservativer Modus' : ''}{fr.state.efficientMode ? ' · effizienter Modus' : ''}</div>
          <div className="row wrap mt">
            {fr.state.paused ? <button className="btn sm" onClick={() => adj('resume')}>Fortsetzen</button> : <button className="btn sm" onClick={() => adj('pause')}>Pausieren</button>}
            <button className="btn sm" onClick={() => adj('regress')}>Leichter machen</button>
            <button className="btn sm" onClick={() => confirm('Auf Ausgangsvorgabe zurücksetzen?') && adj('reset')}>Zurücksetzen</button>
          </div>
          {decs.length > 0 && (
            <>
              <h3>Letzte Entscheidungen</h3>
              <ul className="list">
                {decs.map((d) => <li key={d.id} className="small"><span className="tiny muted">{formatDate(d.date)} · {DECISION_DE[d.type]}</span><div>{d.explanation}</div></li>)}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Vorgabe (Einstieg)</h2>
        <div className="grid3 small">
          <div className="stat"><div className="label">Sätze</div><div className="value">{p.sets ?? '–'}</div></div>
          <div className="stat"><div className="label">Wdh.</div><div className="value">{p.reps ?? '–'}</div></div>
          <div className="stat"><div className="label">Dauer</div><div className="value" style={{ fontSize: 17 }}>{p.durationSec ? `${Math.round(p.durationSec / 60)} min` : p.holdSec ? `${p.holdSec} s` : p.runSec ? `${p.runSec} s` : '–'}</div></div>
          <div className="stat"><div className="label">Gewicht</div><div className="value" style={{ fontSize: 17 }}>{p.weightKg ? `${p.weightKg} kg` : '–'}</div></div>
          <div className="stat"><div className="label">Widerstand</div><div className="value" style={{ fontSize: 17 }}>{p.resistance ?? '–'}</div></div>
          <div className="stat"><div className="label">Pause</div><div className="value" style={{ fontSize: 17 }}>{p.restSec ? `${p.restSec} s` : '–'}</div></div>
        </div>
        <div className="small muted mt">Tempo: {p.tempo === 'slow' ? 'langsam' : p.tempo === 'eccentric' ? 'betont exzentrisch (3–4 s absenken)' : 'kontrolliert, ca. 2 s hoch / 2 s ab'}</div>
      </div>

      <div className="card">
        <h2>Ausführung</h2>
        <ol className="steps">{e.execution.map((x) => <li key={x}>{x}</li>)}</ol>
        <h3>Häufige Fehler</h3>
        <ul className="plain">{e.commonErrors.map((x) => <li key={x}>{x}</li>)}</ul>
        <h3>Sicherheit</h3>
        <ul className="plain">{e.safety.map((x) => <li key={x}>{x}</li>)}</ul>
        {e.medicalNotes.length > 0 && (<><h3>Medizinische Hinweise</h3><ul className="plain">{e.medicalNotes.map((x) => <li key={x}>{x}</li>)}</ul></>)}
      </div>

      <div className="card">
        <h2>Progression & Vereinfachung</h2>
        <div className="small"><b>Steigerungsreihenfolge (je Schritt nur eine Variable):</b> {e.progression.length ? e.progression.map((s) => VARIABLE_LABEL[s.variable]).join(' → ') : 'über das Laufmodul gesteuert'}</div>
        {e.progressionOptions.length > 0 && <ul className="plain small">{e.progressionOptions.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div className="small mt"><b>Vereinfachungen:</b> {e.simplifications.join(', ') || '–'}</div>
        <h3>Varianten dieser Familie</h3>
        <ul className="list">
          {variants.map((v) => (
            <li key={v.id}><a href={`#/library/${v.id}`} className="small">{v.familyLevel}. {v.name}</a>{v.id === e.id && <span className="pill" style={{ marginLeft: 6 }}>diese</span>}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Belastung (vereinfachtes Modell)</h2>
        <div className="small muted">Muskeln: {e.muscles.join(', ')}</div>
        <ul className="list mt">
          {(Object.entries(e.regions) as [AnatomicalRegion, number][]).sort((a, b) => b[1] - a[1]).map(([r, w]) => (
            <li key={r} className="row">
              <span className="small" style={{ width: 120 }}>{REGION_LABEL[r]}</span>
              <div className="progressbar grow"><div style={{ width: `${w * 100}%` }} /></div>
            </li>
          ))}
        </ul>
        <div className="tiny faint">Internes Belastungsmodell, keine Messung der tatsächlichen Gewebebelastung. Freigaben: {e.requiredClearances.map((k) => CLEARANCE_LABEL[k]).join(', ') || 'keine erforderlich'}.</div>
      </div>
    </div>
  );
}
