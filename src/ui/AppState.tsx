import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings, FollowUpCheck, FunctionalTest, ManualAdjustment, TrainingSession, UserProfile } from '../domain/types';
import { Repository, DEFAULT_SETTINGS, type AppData } from '../storage/db';
import { evaluateRehab, type RehabEvaluation } from '../engine/rehabEngine';
import { todayISO, uid } from '../utils/date';
import type { DailyPlan } from '../engine/trainingScheduler';

interface Actions {
  saveProfile(p: UserProfile): Promise<void>;
  saveSettings(s: AppSettings): Promise<void>;
  startSession(plan: DailyPlan): Promise<TrainingSession>;
  saveSession(s: TrainingSession): Promise<void>;
  discardSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  saveFollowUp(f: FollowUpCheck): Promise<void>;
  saveTest(t: FunctionalTest): Promise<void>;
  deleteTest(id: string): Promise<void>;
  addAdjustment(a: Omit<ManualAdjustment, 'id' | 'createdAt'>): Promise<void>;
  replaceAll(d: AppData): Promise<void>;
  deleteEverything(): Promise<void>;
}

interface State {
  loading: boolean;
  error?: string;
  data: AppData;
  today: string;
  evaluation: RehabEvaluation | null;
  draft: TrainingSession | undefined;
  actions: Actions;
}

const Ctx = createContext<State | null>(null);

const EMPTY: AppData = { profile: null, settings: DEFAULT_SETTINGS, sessions: [], followUps: [], tests: [], adjustments: [] };

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    Repository.loadAll()
      .then((d) => setData(d))
      .catch((e) => setError(`Lokale Datenbank konnte nicht geöffnet werden: ${String(e)}`))
      .finally(() => setLoading(false));
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
    const tick = () => setToday(todayISO());
    const iv = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // Theme anwenden
  useEffect(() => {
    const t = data.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [data.settings.theme]);

  const upsert = <T extends { id: string }>(arr: T[], x: T) => {
    const i = arr.findIndex((a) => a.id === x.id);
    if (i < 0) return [...arr, x];
    const c = [...arr];
    c[i] = x;
    return c;
  };

  const actions: Actions = useMemo(
    () => ({
      async saveProfile(p) {
        await Repository.saveProfile(p);
        setData((d) => ({ ...d, profile: { ...p, updatedAt: new Date().toISOString() } }));
      },
      async saveSettings(s) {
        await Repository.saveSettings(s);
        setData((d) => ({ ...d, settings: s }));
      },
      async startSession(plan) {
        const now = new Date().toISOString();
        const s: TrainingSession = {
          id: uid('ses'),
          date: plan.date,
          startedAt: now,
          status: 'draft',
          warnings: [],
          exercises: plan.items.map((it) => ({ exerciseId: it.exerciseId, planned: { ...it.prescription }, actual: { ...it.prescription }, completed: false, skipped: false }))
        };
        await Repository.saveSession(s);
        setData((d) => ({ ...d, sessions: upsert(d.sessions, s) }));
        return s;
      },
      async saveSession(s) {
        await Repository.saveSession(s);
        setData((d) => ({ ...d, sessions: upsert(d.sessions, s) }));
      },
      async discardSession(id) {
        await Repository.deleteSession(id);
        setData((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id), followUps: d.followUps.filter((f) => f.sessionId !== id) }));
      },
      async deleteSession(id) {
        await Repository.deleteSession(id);
        setData((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id), followUps: d.followUps.filter((f) => f.sessionId !== id) }));
      },
      async saveFollowUp(f) {
        await Repository.saveFollowUp(f);
        setData((d) => ({ ...d, followUps: upsert(d.followUps, f) }));
      },
      async saveTest(t) {
        await Repository.saveTest(t);
        setData((d) => ({ ...d, tests: upsert(d.tests, t) }));
      },
      async deleteTest(id) {
        await Repository.deleteTest(id);
        setData((d) => ({ ...d, tests: d.tests.filter((t) => t.id !== id) }));
      },
      async addAdjustment(a) {
        const full: ManualAdjustment = { ...a, id: uid('adj'), createdAt: new Date().toISOString() };
        await Repository.saveAdjustment(full);
        setData((d) => ({ ...d, adjustments: [...d.adjustments, full] }));
      },
      async replaceAll(nd) {
        await Repository.replaceAll(nd);
        setData(nd);
      },
      async deleteEverything() {
        await Repository.deleteEverything();
        setData(EMPTY);
      }
    }),
    []
  );

  const evaluation = useMemo(() => {
    if (!data.profile?.onboardingCompleted) return null;
    try {
      return evaluateRehab({ profile: data.profile, sessions: data.sessions, followUps: data.followUps, tests: data.tests, adjustments: data.adjustments, today });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [data, today]);

  const draft = useMemo(() => data.sessions.filter((s) => s.status === 'draft').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0], [data.sessions]);

  const value: State = { loading, error, data, today, evaluation, draft, actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): State {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp außerhalb des Providers');
  return c;
}

// ---------------------------------------------------------------- Hash-Router
export function useRoute(): [string[], (path: string) => void] {
  const parse = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const [route, setRoute] = useState<string[]>(parse());
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const nav = useCallback((p: string) => {
    location.hash = `#/${p}`;
  }, []);
  return [route, nav];
}

export function navigate(p: string) {
  location.hash = `#/${p}`;
}
