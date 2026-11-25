import { useState } from 'react';
import { useApp } from '../AppState';
import { AnalyticsEngine, type RangeKey, type SeriesPoint } from '../../engine/analyticsEngine';
import { REGION_LABEL } from '../../engine/loadManagementEngine';
import { ExerciseDatabase } from '../../engine/exerciseDatabase';
import { BarChart, LineChart } from '../components/Charts';
import { Empty, Icon, Seg, StatusPill, TopBar } from '../components/ui';
import { DECISION_DE } from '../labels';
import { formatDate, formatShort } from '../../utils/date';
import type { RecoveryStatus } from '../../domain/types';

export function Progress() {
  const { evaluation: ev, today } = useApp();
  const [range, setRange] = useState<RangeKey>('28');
  if (!ev) return null;
  const { ctx } = ev;
  const f = (s: SeriesPoint[]) => s.filter((p) => AnalyticsEngine.inRange(p.date, today, range));
  const insightDays = range === 'all' ? 28 : Number(range);
  const insights = AnalyticsEngine.insights(ctx, today, insightDays);
  const rec = AnalyticsEngine.recoverySeries(ctx).filter((r) => AnalyticsEngine.inRange(r.date, today, range));
  const counts = (['green', 'yellow', 'orange', 'red'] as RecoveryStatus[]).map((s) => ({ s, n: rec.filter((r) => r.status === s).length }));
  const freq = AnalyticsEngine.frequencyPerWeek(ctx, today, 8);
  const regions = AnalyticsEngine.regionDevelopment(ctx, today);
  const decisions = [...ev.decisions].filter((d) => AnalyticsEngine.inRange(d.date, today, range) && d.type !== 'hold').reverse().slice(0, 20);

  return (
    <div>
      <TopBar title="Fortschritt" sub="Wochenanalyse & langfristige Entwicklung" />
      <Seg value={range} options={[{ value: '7', label: '7 Tage' }, { value: '14', label: '14 Tage' }, { value: '28', label: '28 Tage' }, { value: 'all', label: 'Gesamt' }]} onChange={setRange} />

      <div className="card">
        <h2>Analyse</h2>
        <ul className="list">
          {insights.map((i) => (
            <li key={i.text} className="row" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: i.kind === 'positive' ? 'var(--good)' : i.kind === 'caution' ? 'var(--serious)' : 'var(--text-faint)', flex: 'none' }}>
                <Icon name={i.kind === 'positive' ? 'up' : i.kind === 'caution' ? 'alert' : 'equal'} size={18} />
              </span>
              <span className="small">{i.text}</span>
            </li>
          ))}
        </ul>
        <div className="tiny faint">Aussagen beruhen ausschließlich auf deinen dokumentierten Daten.</div>
      </div>

      <div className="card"><h2>Wadenkraft</h2><LineChart title="Wadenkraft-Index" data={f(AnalyticsEngine.calfSeries(ctx))} unit="Index" /></div>
      <div className="card"><h2>Gehzeit</h2><LineChart title="Gehzeit" data={f(AnalyticsEngine.walkingSeries(ctx))} unit="min" /></div>
      <div className="card"><h2>Laufzeit</h2><LineChart title="Laufzeit" data={f(AnalyticsEngine.runningSeries(ctx))} unit="min" emptyText="Noch keine Laufeinheiten." /></div>
      <div className="card"><h2>Trainingsbelastung pro Tag</h2><LineChart title="Belastung" data={f(AnalyticsEngine.loadSeries(ctx))} unit="LE" /><div className="tiny faint">LE = relative Belastungseinheiten, nur zum Vergleich mit deiner eigenen Historie.</div></div>
      <div className="card"><h2>Schmerzen</h2><LineChart title="Schmerz" data={f(AnalyticsEngine.painSeries(ctx))} unit="/10" yMax={10} /></div>
      <div className="card"><h2>Schwellung</h2><LineChart title="Schwellung" data={f(AnalyticsEngine.swellingSeries(ctx))} unit="(0–3)" yMax={3} integerTicks /></div>
      <div className="card"><h2>Gleichgewicht (Einbeinstand)</h2><LineChart title="Einbeinstand" data={f(AnalyticsEngine.balanceSeries(ctx))} unit="s" emptyText="Noch keine Einbeinstand-Daten." /></div>

      <div className="card">
        <h2>Regeneration</h2>
        {rec.length ? (
          <div className="row wrap">
            {counts.map((c) => (
              <span key={c.s} className="row" style={{ gap: 6 }}><StatusPill status={c.s} /> <b>{c.n}</b></span>
            ))}
          </div>
        ) : (
          <Empty>Keine Einheiten im Zeitraum.</Empty>
        )}
      </div>

      <div className="card">
        <h2>Trainingshäufigkeit</h2>
        <BarChart title="Einheiten pro Woche" unit="Einheiten" data={freq.map((w) => ({ label: formatShort(w.weekStart), value: w.count }))} />
      </div>

      <div className="card">
        <h2>Entwicklung je anatomischem Bereich</h2>
        {regions.length ? (
          <div className="scroll-x">
            <table className="matrix">
              <thead><tr><th>Bereich</th><th>7 T</th><th>28 T</th><th>Δ zur Vorwoche</th></tr></thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.region}>
                    <td>{REGION_LABEL[r.region]}</td>
                    <td>{r.d7.toLocaleString('de-DE')}</td>
                    <td>{r.d28.toLocaleString('de-DE')}</td>
                    <td>{r.changePct === null ? '–' : `${r.changePct > 0 ? '+' : ''}${r.changePct} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Noch keine Belastungsdaten.</Empty>
        )}
      </div>

      <div className="card">
        <h2>Anpassungen im Zeitraum</h2>
        {decisions.length ? (
          <ul className="list">
            {decisions.map((d) => (
              <li key={d.id}>
                <div className="row between"><span className="tiny muted">{formatDate(d.date)} · {ExerciseDatabase.get(d.exerciseId)?.name}</span><span className="pill">{DECISION_DE[d.type]}</span></div>
                <div className="small">{d.explanation}</div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine Änderungen der Vorgaben im Zeitraum.</Empty>
        )}
      </div>
    </div>
  );
}
