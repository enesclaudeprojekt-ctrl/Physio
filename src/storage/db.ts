/**
 * Lokale Datenhaltung (IndexedDB). Keine Cloud, keine Accounts.
 * Jede Änderung wird sofort persistiert (automatische Speicherung).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, FollowUpCheck, FunctionalTest, ManualAdjustment, TrainingSession, UserProfile } from '../domain/types';

export const DB_NAME = 'rehakompass';
export const DB_VERSION = 1;

interface RehaDB extends DBSchema {
  profile: { key: string; value: UserProfile };
  settings: { key: string; value: AppSettings };
  sessions: { key: string; value: TrainingSession; indexes: { byDate: string } };
  followUps: { key: string; value: FollowUpCheck; indexes: { bySession: string } };
  tests: { key: string; value: FunctionalTest };
  adjustments: { key: string; value: ManualAdjustment };
}

export interface AppData {
  profile: UserProfile | null;
  settings: AppSettings;
  sessions: TrainingSession[];
  followUps: FollowUpCheck[];
  tests: FunctionalTest[];
  adjustments: ManualAdjustment[];
}

export const DEFAULT_SETTINGS: AppSettings = { id: 'settings', theme: 'system', disclaimerAccepted: false, showTechnicalDetails: false };

let dbPromise: Promise<IDBPDatabase<RehaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<RehaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RehaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('profile', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('byDate', 'date');
        const f = db.createObjectStore('followUps', { keyPath: 'id' });
        f.createIndex('bySession', 'sessionId');
        db.createObjectStore('tests', { keyPath: 'id' });
        db.createObjectStore('adjustments', { keyPath: 'id' });
      }
    });
  }
  return dbPromise;
}

/** Nur für Tests: Verbindung zurücksetzen */
export function resetDBConnection() {
  dbPromise = null;
}

export const Repository = {
  async loadAll(): Promise<AppData> {
    const db = await getDB();
    const [profile, settings, sessions, followUps, tests, adjustments] = await Promise.all([
      db.get('profile', 'profile'),
      db.get('settings', 'settings'),
      db.getAll('sessions'),
      db.getAll('followUps'),
      db.getAll('tests'),
      db.getAll('adjustments')
    ]);
    return { profile: profile ?? null, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) }, sessions, followUps, tests, adjustments };
  },
  async saveProfile(p: UserProfile) {
    await (await getDB()).put('profile', { ...p, updatedAt: new Date().toISOString() });
  },
  async saveSettings(s: AppSettings) {
    await (await getDB()).put('settings', s);
  },
  async saveSession(s: TrainingSession) {
    await (await getDB()).put('sessions', s);
  },
  async deleteSession(id: string) {
    const db = await getDB();
    const tx = db.transaction(['sessions', 'followUps'], 'readwrite');
    await tx.objectStore('sessions').delete(id);
    const fus = await tx.objectStore('followUps').index('bySession').getAllKeys(id);
    for (const k of fus) await tx.objectStore('followUps').delete(k);
    await tx.done;
  },
  async saveFollowUp(f: FollowUpCheck) {
    await (await getDB()).put('followUps', f);
  },
  async saveTest(t: FunctionalTest) {
    await (await getDB()).put('tests', t);
  },
  async deleteTest(id: string) {
    await (await getDB()).delete('tests', id);
  },
  async saveAdjustment(a: ManualAdjustment) {
    await (await getDB()).put('adjustments', a);
  },
  async deleteAdjustment(id: string) {
    await (await getDB()).delete('adjustments', id);
  },
  /** Ersetzt den gesamten Datenbestand (Import / Wiederherstellung) – atomar */
  async replaceAll(data: AppData) {
    const db = await getDB();
    const stores = ['profile', 'settings', 'sessions', 'followUps', 'tests', 'adjustments'] as const;
    const tx = db.transaction([...stores], 'readwrite');
    for (const s of stores) await tx.objectStore(s).clear();
    if (data.profile) await tx.objectStore('profile').put(data.profile);
    await tx.objectStore('settings').put(data.settings);
    for (const x of data.sessions) await tx.objectStore('sessions').put(x);
    for (const x of data.followUps) await tx.objectStore('followUps').put(x);
    for (const x of data.tests) await tx.objectStore('tests').put(x);
    for (const x of data.adjustments) await tx.objectStore('adjustments').put(x);
    await tx.done;
  },
  /** Vollständige Löschung aller lokalen Daten */
  async deleteEverything() {
    const db = await getDB();
    const stores = ['profile', 'settings', 'sessions', 'followUps', 'tests', 'adjustments'] as const;
    const tx = db.transaction([...stores], 'readwrite');
    for (const s of stores) await tx.objectStore(s).clear();
    await tx.done;
  }
};
