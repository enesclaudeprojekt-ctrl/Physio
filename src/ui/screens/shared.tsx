import { useApp } from '../AppState';
import { Banner } from '../components/ui';
import { WARNING_LABEL } from '../../engine/recoveryAssessmentEngine';
import { formatDate, todayISO } from '../../utils/date';

export function SafetyBanner() {
  const { evaluation: ev, actions } = useApp();
  if (!ev) return null;
  const s = ev.safety;
  if (s.level === 'ok') return null;
  if (s.level === 'caution')
    return (
      <Banner kind="warn" title="Vorsicht">
        {s.messages.map((m) => (
          <div key={m}>{m}</div>
        ))}
      </Banner>
    );
  const clear = async () => {
    if (!confirm('Bestätigst du, dass die Warnzeichen ärztlich abgeklärt wurden und du wieder trainieren darfst? Das Training wird dann reduziert fortgesetzt.')) return;
    await actions.addAdjustment({ date: todayISO(), action: 'warningCleared', note: 'Warnzeichen ärztlich abgeklärt' });
  };
  return (
    <Banner kind="danger" title={s.level === 'emergency' ? 'Notfall – sofort Hilfe holen' : 'Training gestoppt'}>
      {s.messages.map((m) => (
        <div key={m} style={{ marginBottom: 4 }}>{m}</div>
      ))}
      <div className="small muted">Dokumentiert: {s.activeWarnings.map((w) => `${WARNING_LABEL[w.symptom]} (${formatDate(w.date)})`).join('; ')}</div>
      {s.level === 'emergency' && (
        <a className="btn danger block mt" href="tel:112">112 anrufen</a>
      )}
      <button className="btn sm mt" onClick={clear}>Ärztlich abgeklärt – Training freigegeben</button>
    </Banner>
  );
}
