import { useEffect, useState } from 'react';
import type { ExerciseLog, PainLocation, Prescription, TrainingSession, WarningSymptom } from '../../domain/types';
import { WARNING_SYMPTOMS } from '../../domain/types';
import { useApp, navigate } from '../AppState';
import { ExerciseDatabase } from '../../engine/exerciseDatabase';
import { formatDetails, formatDuration, formatMain } from '../../engine/prescription';
import { WARNING_LABEL } from '../../engine/recoveryAssessmentEngine';
import { Banner, Chips, Field, Icon, Scale, Seg, Stepper, Timer, TopBar } from '../components/ui';
import { ExerciseIllustration } from '../components/ExerciseIllustration';
import { GAIT_OPTIONS, PAIN_LOCATIONS, QUALITY_OPTIONS, SWELLING_OPTIONS } from '../labels';

const WARN_OPTIONS = WARNING_SYMPTOMS.map((w) => ({ value: w, label: WARNING_LABEL[w] }));

export function Workout() {
  const { draft, actions } = useApp();
  if (!draft) {
    return (
      <div>
        <TopBar title="Training" back={() => navigate('today')} />
        <Banner kind="info">Keine laufende Einheit. Starte das Training über „Heute“.</Banner>
      </div>
    );
  }
  return <WorkoutFlow key={draft.id} session={draft} save={actions.saveSession} discard={actions.discardSession} />;
}

function WorkoutFlow({ session, save, discard }: { session: TrainingSession; save: (s: TrainingSession) => Promise<void>; discard: (id: string) => Promise<void> }) {
  const [s, setS] = useState(session);
  const [showWarn, setShowWarn] = useState(false);
  const update = async (n: TrainingSession) => {
    setS(n);
    await save(n);
  };
  const idx = s.exercises.findIndex((e) => !e.completed && !e.skipped);
  const phase = s.painBefore === undefined ? 'pre' : idx >= 0 ? 'exercise' : 'post';
  const doneCount = s.exercises.filter((e) => e.completed || e.skipped).length;

  const abort = async (warnings: WarningSymptom[]) => {
    const exercises = s.exercises.map((e) => (e.completed ? e : { ...e, skipped: true }));
    await update({ ...s, exercises, warnings: [...new Set([...s.warnings, ...warnings])], status: 'completed', completedAt: new Date().toISOString(), notes: [s.notes, 'Einheit wegen Warnzeichen abgebrochen'].filter(Boolean).join(' | ') });
    navigate(`summary/${s.id}`);
  };

  return (
    <div>
      <TopBar
        title={phase === 'pre' ? 'Vor dem Training' : phase === 'post' ? 'Abschluss' : `Übung ${idx + 1} von ${s.exercises.length}`}
        back={() => navigate('today')}
        right={
          <button className="btn sm danger" onClick={() => setShowWarn(true)}>
            <Icon name="alert" size={16} /> Warnzeichen
          </button>
        }
      />
      <div className="progressbar mb"><div style={{ width: `${(doneCount / Math.max(1, s.exercises.length)) * 100}%` }} /></div>

      {showWarn && <WarnSheet onCancel={() => setShowWarn(false)} onConfirm={abort} />}

      {phase === 'pre' && <PreCheck s={s} onDone={(painBefore, warnings) => (warnings.length ? abort(warnings) : update({ ...s, painBefore }))} onDiscard={async () => { if (confirm('Einheit verwerfen?')) { await discard(s.id); navigate('today'); } }} />}
      {phase === 'exercise' && (
        <ExerciseStep
          key={idx}
          log={s.exercises[idx]}
          painBefore={s.painBefore ?? 0}
          next={s.exercises[idx + 1]?.exerciseId}
          onSave={(log) => {
            const exercises = [...s.exercises];
            exercises[idx] = log;
            update({ ...s, exercises });
          }}
        />
      )}
      {phase === 'post' && (
        <PostCheck
          s={s}
          onBack={() => {
            const exercises = [...s.exercises];
            const last = exercises.length - 1;
            exercises[last] = { ...exercises[last], completed: false, skipped: false };
            update({ ...s, exercises });
          }}
          onDone={async (patch) => {
            await update({ ...s, ...patch, status: 'completed', completedAt: new Date().toISOString() });
            navigate(`summary/${s.id}`);
          }}
        />
      )}
    </div>
  );
}

function WarnSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (w: WarningSymptom[]) => void }) {
  const [w, setW] = useState<WarningSymptom[]>([]);
  return (
    <div className="card" style={{ borderColor: 'var(--critical)' }}>
      <h2>Warnzeichen dokumentieren</h2>
      <p className="small muted">Bei einem Warnzeichen wird die Einheit sofort beendet und das Training gestoppt, bis du eine ärztliche Abklärung bestätigst.</p>
      <Chips values={w} options={WARN_OPTIONS} onChange={setW} tone="bad" />
      {w.includes('breathlessnessChestPain') && <Banner kind="danger" title="Notfall">Bei Atemnot oder Brustschmerzen sofort den Notruf 112 wählen.</Banner>}
      <div className="btn-row mt">
        <button className="btn" onClick={onCancel}>Abbrechen</button>
        <button className="btn danger" disabled={!w.length} onClick={() => onConfirm(w)}>Einheit beenden</button>
      </div>
    </div>
  );
}

function PreCheck({ s, onDone, onDiscard }: { s: TrainingSession; onDone: (pain: number, w: WarningSymptom[]) => void; onDiscard: () => void }) {
  const [pain, setPain] = useState<number | undefined>(s.painBefore);
  const [warn, setWarn] = useState<WarningSymptom[]>([]);
  return (
    <div className="card">
      <Field label="Schmerz vor dem Training (0–10)">
        <Scale value={pain} onChange={setPain} labels={['kein', 'stärkster']} />
      </Field>
      <Field label="Hast du aktuell eines dieser Symptome?" hint="Wenn ja, bitte nicht trainieren.">
        <Chips values={warn} options={WARN_OPTIONS} onChange={setWarn} tone="bad" />
      </Field>
      {pain !== undefined && pain >= 5 && <Banner kind="warn">Deutliche Schmerzen schon vor dem Training. Überlege, heute nur zu mobilisieren, und kläre anhaltende Schmerzen ärztlich ab.</Banner>}
      <div className="btn-row">
        <button className="btn" onClick={onDiscard}>Verwerfen</button>
        <button className="btn primary" disabled={pain === undefined} onClick={() => onDone(pain!, warn)}>{warn.length ? 'Einheit nicht durchführen' : 'Los geht’s'}</button>
      </div>
    </div>
  );
}

type NumField = keyof Pick<Prescription, 'sets' | 'reps' | 'durationSec' | 'holdSec' | 'weightKg' | 'resistance' | 'speedKmh' | 'inclinePct' | 'rounds' | 'contacts' | 'runSec' | 'intensityPct'>;
const FIELDS: { key: NumField; label: string; step: number; format?: (v: number) => string }[] = [
  { key: 'sets', label: 'Sätze', step: 1 },
  { key: 'reps', label: 'Wiederholungen', step: 1 },
  { key: 'holdSec', label: 'Haltezeit (s)', step: 5 },
  { key: 'durationSec', label: 'Dauer', step: 60, format: formatDuration },
  { key: 'runSec', label: 'Joggen je Intervall', step: 15, format: formatDuration },
  { key: 'rounds', label: 'Intervalle', step: 1 },
  { key: 'weightKg', label: 'Gewicht (kg)', step: 0.5 },
  { key: 'resistance', label: 'Widerstand', step: 1 },
  { key: 'speedKmh', label: 'Tempo (km/h)', step: 0.1 },
  { key: 'inclinePct', label: 'Steigung (%)', step: 1 },
  { key: 'contacts', label: 'Kontakte', step: 1 },
  { key: 'intensityPct', label: 'Intensität (%)', step: 5 }
];

function ExerciseStep({ log, painBefore, next, onSave }: { log: ExerciseLog; painBefore: number; next?: string; onSave: (l: ExerciseLog) => void }) {
  const def = ExerciseDatabase.require(log.exerciseId);
  const [actual, setActual] = useState<Prescription>(log.actual);
  const [pain, setPain] = useState<number>(log.painDuring ?? painBefore);
  const [rpe, setRpe] = useState<number>(log.rpe ?? 5);
  const [quality, setQuality] = useState(log.movementQuality ?? 'controlled');
  const [stability, setStability] = useState(log.stability ?? 4);
  const [notes, setNotes] = useState(log.notes ?? '');
  const [edit, setEdit] = useState(false);
  const [info, setInfo] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const p = log.planned;
  const fields = FIELDS.filter((f) => p[f.key] !== undefined);
  const timerSec = p.holdSec ?? (p.durationSec && p.durationSec <= 180 ? p.durationSec : undefined);

  const commit = (skipped: boolean) =>
    onSave({ ...log, actual: skipped ? log.actual : actual, completed: !skipped, skipped, painDuring: skipped ? undefined : pain, rpe: skipped ? undefined : rpe, movementQuality: skipped ? undefined : quality, stability: skipped ? undefined : stability, notes: notes || undefined });

  return (
    <div>
      <div className="hero-ill"><ExerciseIllustration illustration={def.illustration} title={def.name} /></div>
      <div className="tiny faint mt">Blass = Ausgangsposition · farbig = betroffenes Bein · schematisch</div>
      <h2 style={{ fontSize: 22, margin: '10px 0 2px' }}>{def.name}</h2>
      <div className="big-presc">{formatMain(p)}</div>
      <div className="muted">{[...formatDetails(p), p.restSec ? `Pause ${p.restSec} s` : ''].filter(Boolean).join(' · ')}</div>
      <p className="small">{def.description}</p>
      <button className="btn sm" onClick={() => setInfo(!info)}>{info ? 'Ausführung ausblenden' : 'Ausführung & Sicherheit'}</button>
      {info && (
        <div className="card small">
          <b>Ausführung</b>
          <ol className="steps">{def.execution.map((x) => <li key={x}>{x}</li>)}</ol>
          <b>Häufige Fehler</b>
          <ul className="plain">{def.commonErrors.map((x) => <li key={x}>{x}</li>)}</ul>
          <b>Sicherheit</b>
          <ul className="plain">{def.safety.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <div className="grid2 mt">
        {timerSec ? <Timer seconds={timerSec} label={p.holdSec ? 'Haltezeit' : 'Dauer'} /> : null}
        {p.restSec ? <Timer seconds={p.restSec} label="Satzpause" /> : null}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Tatsächliche Leistung</h2>
          <button className="btn sm ghost" onClick={() => setEdit(!edit)}>{edit ? 'Fertig' : 'Abweichung eintragen'}</button>
        </div>
        {!edit ? (
          <div className="muted small">Wie geplant: <b>{formatMain(actual)}</b> {formatDetails(actual).join(' · ')}</div>
        ) : (
          <div className="grid2">
            {fields.map((f) => (
              <Stepper key={f.key} label={f.label} value={Number(actual[f.key] ?? 0)} step={f.step} format={f.format} onChange={(v) => setActual({ ...actual, [f.key]: v })} />
            ))}
          </div>
        )}
        <Field label="Schmerz während der Übung">
          <Scale value={pain} onChange={setPain} />
        </Field>
        <Field label="Bewegungsqualität">
          <Seg value={quality} options={QUALITY_OPTIONS} onChange={setQuality} />
        </Field>
        <div className="grid2">
          <Stepper label="Anstrengung (RPE 0–10)" value={rpe} min={0} max={10} onChange={setRpe} />
          <Stepper label="Stabilität (1–5)" value={stability} min={1} max={5} onChange={setStability} />
        </div>
        <Field label="Notiz (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {pain >= 5 && <Banner kind="warn">Deutlicher Schmerz: Übung beenden oder vereinfachen ({def.simplifications.join(', ') || 'kleinere Amplitude'}).</Banner>}
      </div>
      <div className="sticky-actions">
        <div className="btn-row">
          <button className="btn" onClick={() => commit(true)}>Überspringen</button>
          <button className="btn primary lg" style={{ flex: 2 }} onClick={() => commit(false)}>
            <Icon name="check" size={20} /> Erledigt
          </button>
        </div>
        {next && <div className="tiny muted center mt">Als Nächstes: {ExerciseDatabase.get(next)?.name}</div>}
      </div>
    </div>
  );
}

function PostCheck({ s, onDone, onBack }: { s: TrainingSession; onDone: (p: Partial<TrainingSession>) => void; onBack: () => void }) {
  const [painAfter, setPainAfter] = useState<number | undefined>(s.painAfter);
  const [swelling, setSwelling] = useState<0 | 1 | 2 | 3 | undefined>(s.swelling);
  const [gait, setGait] = useState(s.gait);
  const [fatigue, setFatigue] = useState(s.fatigue ?? 5);
  const [locs, setLocs] = useState<PainLocation[]>(s.painLocations ?? []);
  const [notes, setNotes] = useState(s.notes ?? '');
  const [warn, setWarn] = useState<WarningSymptom[]>(s.warnings);
  const ok = painAfter !== undefined && swelling !== undefined && gait !== undefined;
  return (
    <div className="card">
      <p className="small muted">Fast geschafft. Diese Angaben sind wichtig für die Bewertung der Belastungsreaktion.</p>
      <Field label="Schmerz nach dem Training">
        <Scale value={painAfter} onChange={setPainAfter} labels={['kein', 'stärkster']} />
      </Field>
      <Field label="Schwellung">
        <Seg value={swelling} options={SWELLING_OPTIONS.map((o) => ({ ...o }))} onChange={(v) => setSwelling(v as 0 | 1 | 2 | 3)} />
      </Field>
      <Field label="Gangbild nach dem Training">
        <Seg value={gait} options={GAIT_OPTIONS.map((o) => ({ ...o, label: o.label.replace('verändert', 'veränd.').replace('Nicht beurteilbar', 'n. beurteilb.') }))} onChange={setGait} />
      </Field>
      <Stepper label="Ermüdung (0–10)" value={fatigue} min={0} max={10} onChange={setFatigue} />
      <Field label="Wo traten Schmerzen auf? (optional)">
        <Chips values={locs} options={PAIN_LOCATIONS} onChange={setLocs} />
      </Field>
      <Field label="Warnzeichen?">
        <Chips values={warn} options={WARN_OPTIONS} onChange={setWarn} tone="bad" />
      </Field>
      <Field label="Besonderheiten">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="btn-row">
        <button className="btn" onClick={onBack}>Zurück</button>
        <button className="btn primary" disabled={!ok} onClick={() => onDone({ painAfter, swelling, gait, fatigue, painLocations: locs, notes: notes || undefined, warnings: warn })}>
          Einheit abschließen
        </button>
      </div>
    </div>
  );
}
