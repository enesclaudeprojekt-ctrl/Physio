import { useApp, navigate } from '../AppState';
import { AnalyticsEngine } from '../../engine/analyticsEngine';
import { MedicalRestrictionsEngine } from '../../engine/medicalRestrictionsEngine';
import { LoadManagementEngine } from '../../engine/loadManagementEngine';
import { REHAB_PHASES } from '../../engine/rehabEngine';
import { RUN_STAGES } from '../../engine/runningProgressionEngine';
import { Banner, Empty, Icon, Ring, StatusPill, TopBar } from '../components/ui';
import { LineChart } from '../components/Charts';
import { formatDate, weekdayName, daysBetween } from '../../utils/date';
import { ExerciseDatabase } from '../../engine/exerciseDatabase';
import { SafetyBanner } from './shared';

export function Dashboard() {
  const { evaluation: ev, today, draft, data } = useApp();
  if (!ev) return null;
  const { ctx, plan } = ev;
  const last = ctx.completed[ctx.completed.length - 1];
  const lastLoad = last ? LoadManagementEngine.sessionLoad(last).total : 0;
  const recent = [...ctx.evaluations.values()].filter((e) => daysBetween(e.session.date, today) < 7);
  const avgScore = recent.length ? recent.reduce((s, e) => s + e.score.total, 0) / recent.length : null;
  const readyCount = ev.readiness.filter((r) => r.criteriaMet).length;
  const restrictions = MedicalRestrictionsEngine.activeRestrictions(ctx.profile);
  const name = data.profile?.name;

  return (
    <div>
      <TopBar title={name ? `Hallo ${name}` : 'Übersicht'} sub={`${weekdayName(today)}, ${formatDate(today)}`} />
      <SafetyBanner />

      {plan.pendingFollowUps[0] && (
        <div className="card accent">
          <h2>Wie hat dein Bein auf die Belastung vom {formatDate(plan.pendingFollowUps[0].date, { weekday: 'long' })} reagiert?</h2>
          <p className="muted small">Die Folgetagsrückmeldung ist die Grundlage für jede Steigerung. Dauert ca. 20 Sekunden.</p>
          <button className="btn primary block" onClick={() => navigate(`followup/${plan.pendingFollowUps[0].id}`)}>Jetzt beantworten</button>
        </div>
      )}

      {draft && (
        <Banner kind="info" title="Unterbrochene Einheit">
          Du hast am {formatDate(draft.date)} eine Einheit begonnen. <a href="#/workout">Fortsetzen</a>
        </Banner>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Reha-Phase</h2>
          <span className="pill accent">{ev.phase.index + 1} / {REHAB_PHASES.length}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 750 }}>{ev.phase.name}</div>
        <div className="muted small">{ev.phase.description}</div>
        <div className="phase-steps" aria-hidden>
          {REHAB_PHASES.map((_, i) => (
            <div key={i} className={i < ev.phase.index ? 'done' : i === ev.phase.index ? 'cur' : ''} />
          ))}
        </div>
        <div className="tiny faint mt">Die Phase ergibt sich aus Freigaben und tatsächlicher Entwicklung, nicht aus dem Kalender.</div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Heute</h2>
          <span className="muted small">{plan.totalMinutes ? `ca. ${plan.totalMinutes} min` : ''}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{plan.headline}</div>
        {plan.items.length > 0 ? (
          <ul className="list mt">
            {plan.items.slice(0, 5).map((it) => (
              <li key={it.exerciseId} className="row between">
                <span>{ExerciseDatabase.get(it.exerciseId)?.name}</span>
                {it.changed && <span className={`pill ${it.changeType === 'progress' || it.changeType === 'variantChange' ? 'accent' : 'yellow'}`}>{it.changeType === 'progress' || it.changeType === 'variantChange' ? 'Neu ↑' : 'Angepasst'}</span>}
              </li>
            ))}
            {plan.items.length > 5 && <li className="muted small">+ {plan.items.length - 5} weitere</li>}
          </ul>
        ) : (
          <p className="muted small">{plan.notes[0]}</p>
        )}
        <button className="btn primary block lg mt" onClick={() => navigate('today')}>
          <Icon name="play" size={18} /> Zum heutigen Training
        </button>
      </div>

      <div className="grid2">
        <div className="card flat" style={{ margin: 0 }}>
          <div className="muted small">Regeneration</div>
          <div className="mt">{plan.recovery ? <StatusPill status={plan.recovery.status} /> : <span className="pill">Keine aktuelle Einheit</span>}</div>
          <div className="tiny muted mt">{plan.recovery?.findings.slice(0, 2).join(', ') || (plan.recovery?.hasFollowUp === false ? 'Folgetag noch offen' : 'Unauffällig')}</div>
        </div>
        <div className="card flat row" style={{ margin: 0 }}>
          <Ring value={avgScore ?? 0} label="Score 7 T" />
          <div className="tiny muted">{avgScore === null ? 'Noch keine Werte' : 'Ø Progressionsscore der letzten 7 Tage'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Belastbarkeit</h2>
          <a className="small" href="#/load">Details</a>
        </div>
        <div className="grid3">
          <div className="stat"><div className="label">Gehen vertragen</div><div className="value">{ev.metrics.walkingMinTolerated ?? '–'}<span className="unit">min</span></div></div>
          <div className="stat"><div className="label">Laufstufe</div><div className="value">{ev.running.totalRuns ? RUN_STAGES[ev.running.stageIndex].id : '–'}</div></div>
          <div className="stat"><div className="label">Kriterien erfüllt</div><div className="value">{readyCount}<span className="unit">/ {ev.readiness.length}</span></div></div>
        </div>
        <div className="small muted mt">{ev.runningPlan.status === 'run' ? `Laufen: ${RUN_STAGES[ev.runningPlan.stageIndex].label}` : ev.runningPlan.explanation}</div>
      </div>

      <div className="card">
        <h2>Nächste geplante Progression</h2>
        {ev.nextProgressions.length ? (
          <ul className="list">
            {ev.nextProgressions.slice(0, 3).map((n) => (
              <li key={n.exerciseId} className="small">{n.text}</li>
            ))}
          </ul>
        ) : (
          <Empty>Sobald Übungen dokumentiert sind, erscheint hier die nächste mögliche Steigerung.</Empty>
        )}
      </div>

      <div className="card">
        <h2>Letzte Einheit</h2>
        {last ? (
          <button className="list-btn" onClick={() => navigate(`history/${last.id}`)}>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{formatDate(last.date, { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
              <div className="muted small">{last.exercises.filter((e) => !e.skipped).length} Übungen · Belastung {lastLoad.toLocaleString('de-DE')} LE · Schmerz danach {last.painAfter ?? '–'}/10</div>
            </div>
            <Icon name="chevron" />
          </button>
        ) : (
          <Empty>Noch keine Einheit dokumentiert.</Empty>
        )}
      </div>

      <div className="card">
        <h2>Schmerzverlauf</h2>
        <LineChart title="Schmerz" data={AnalyticsEngine.painSeries(ctx).slice(-21)} unit="/10" yMax={10} />
      </div>
      <div className="card">
        <h2>Schwellungsverlauf</h2>
        <LineChart title="Schwellung" data={AnalyticsEngine.swellingSeries(ctx).slice(-21)} yMax={3} integerTicks unit="(0–3)" />
      </div>
      <div className="card">
        <h2>Wadenkraft-Entwicklung</h2>
        <LineChart title="Wadenkraft-Index" data={AnalyticsEngine.calfSeries(ctx).slice(-21)} unit="Index" />
        <div className="tiny faint">Relativer Index aus Volumen × Variantenstufe – kein Kraftmesswert.</div>
      </div>
      <div className="card">
        <h2>Gehfähigkeit</h2>
        <LineChart title="Gehzeit" data={AnalyticsEngine.walkingSeries(ctx).slice(-21)} unit="min" />
      </div>
      <div className="card">
        <h2>Laufentwicklung</h2>
        <LineChart title="Laufzeit" data={AnalyticsEngine.runningSeries(ctx).slice(-21)} unit="min Joggen" emptyText="Noch keine Laufeinheiten." />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Aktuelle Einschränkungen</h2>
          <a className="small" href="#/settings/clearances">Bearbeiten</a>
        </div>
        {restrictions.length ? (
          <ul className="list">
            {restrictions.map((r) => (
              <li key={r.label + r.detail} className="row">
                <span className={`pill ${r.kind === 'denied' ? 'red' : r.kind === 'unknown' ? '' : 'yellow'}`}>{r.kind === 'denied' ? 'Nein' : r.kind === 'unknown' ? <><Icon name="lock" size={12} /> Gesperrt</> : 'Hinweis'}</span>
                <span className="grow small"><b>{r.label}</b> – {r.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine Einschränkungen dokumentiert.</Empty>
        )}
      </div>
    </div>
  );
}
