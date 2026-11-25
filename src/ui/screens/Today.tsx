import { useState } from 'react';
import { useApp, navigate } from '../AppState';
import { ExerciseDatabase } from '../../engine/exerciseDatabase';
import { formatDetails, formatMain } from '../../engine/prescription';
import { BLOCK_LABEL } from '../../engine/trainingScheduler';
import { Banner, Icon, TopBar } from '../components/ui';
import { ExerciseIllustration } from '../components/ExerciseIllustration';
import { STATUS_DE } from '../labels';
import { formatDate, weekdayName } from '../../utils/date';
import { SafetyBanner } from './shared';

export function Today() {
  const { evaluation: ev, actions, draft, today } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  if (!ev) return null;
  const plan = ev.plan;

  const start = async () => {
    if (draft) {
      navigate('workout');
      return;
    }
    await actions.startSession(plan);
    navigate('workout');
  };

  return (
    <div>
      <TopBar title="Heutiges Training" sub={`${weekdayName(today)}, ${formatDate(today)}`} />
      <SafetyBanner />
      {plan.pendingFollowUps[0] && (
        <Banner kind="warn" title="Folgetagsrückmeldung offen">
          Wie hat dein Bein auf die letzte Einheit reagiert? <a href={`#/followup/${plan.pendingFollowUps[0].id}`}>Jetzt beantworten</a> – erst danach kann die App über Steigerungen entscheiden.
        </Banner>
      )}

      <div className="card accent">
        <div className="row between">
          <div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>{plan.headline}</div>
            <div className="muted small">{plan.items.length} Übungen · ca. {plan.totalMinutes} min</div>
          </div>
          {plan.recovery && <span className={`pill ${plan.recovery.status}`}>{plan.recovery.status === 'green' ? 'Erholt' : 'Beschwerden'}</span>}
        </div>
        {plan.notes.map((n) => (
          <p key={n} className="small" style={{ margin: '8px 0 0' }}>{n}</p>
        ))}
        {plan.items.length > 0 && (
          <button className="btn primary block lg mt" onClick={start}>
            <Icon name="play" size={18} /> {draft ? 'Einheit fortsetzen' : 'Training starten'}
          </button>
        )}
        {plan.kind === 'done' && (
          <a className="btn block mt" href="#/history">Zur Trainingshistorie</a>
        )}
      </div>

      {plan.items.map((it) => {
        const def = ExerciseDatabase.require(it.exerciseId);
        const isOpen = open === it.exerciseId;
        return (
          <div className="card" key={it.exerciseId}>
            <div className="exrow">
              <div className="exthumb"><ExerciseIllustration illustration={def.illustration} title={def.name} /></div>
              <div className="grow">
                <div className="tiny faint">{BLOCK_LABEL[it.block]}</div>
                <div className="exname">{def.name}</div>
                <div className="exmeta">{formatMain(it.prescription)}{formatDetails(it.prescription).length ? ` · ${formatDetails(it.prescription).join(' · ')}` : ''}</div>
              </div>
              {it.changed && <span className={`pill ${it.changeType === 'progress' || it.changeType === 'variantChange' ? 'accent' : 'yellow'}`}>{it.changeType === 'progress' || it.changeType === 'variantChange' ? '↑ Neu' : 'Angepasst'}</span>}
            </div>
            {it.note && <div className="banner warn small" style={{ marginBottom: 0 }}>{it.note}</div>}
            <button className="btn sm ghost mt" onClick={() => setOpen(isOpen ? null : it.exerciseId)} aria-expanded={isOpen}>
              {isOpen ? 'Weniger' : 'Warum diese Vorgabe? · Ausführung'}
            </button>
            {isOpen && (
              <div className="small">
                <p><b>Entscheidung:</b> {it.explanation}</p>
                <p className="muted">Status: {STATUS_DE[it.status]}{it.prescription.restSec ? ` · Pause ${it.prescription.restSec} s` : ''}</p>
                <b>Ausführung</b>
                <ol className="steps">{def.execution.map((s) => <li key={s}>{s}</li>)}</ol>
                <b>Sicherheit</b>
                <ul className="plain">{def.safety.map((s) => <li key={s}>{s}</li>)}</ul>
                <a href={`#/library/${def.id}`}>Vollständige Übungsbeschreibung</a>
              </div>
            )}
          </div>
        );
      })}

      {plan.blocked.length > 0 && (
        <div className="card">
          <h2>Heute nicht eingeplant</h2>
          <ul className="list">
            {plan.blocked.map((b, i) => (
              <li key={i} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="no-ico"><Icon name="lock" size={16} /></span>
                <span className="small"><b>{b.label}:</b> {b.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
