import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Repository, DEFAULT_SETTINGS } from '../src/storage/db';
import { buildExport, parseImport, sessionsToCSV } from '../src/storage/exportImport';
import { followUp, profileWith, session, START } from './helpers';

describe('Datenhaltung, Export und Import', () => {
  const profile = profileWith();
  const s = session(START, [{ exerciseId: 'bilateral_calf_raise', planned: { sets: 3, reps: 10 } }], { notes: 'Test; mit "Zeichen"' });
  const f = followUp(s);

  it('speichert und lädt alle Daten (kein Datenverlust nach Neustart)', async () => {
    await Repository.saveProfile(profile);
    await Repository.saveSession(s);
    await Repository.saveFollowUp(f);
    const data = await Repository.loadAll();
    expect(data.profile?.clearances.fullWeightBearing.status).toBe('granted');
    expect(data.sessions).toHaveLength(1);
    expect(data.followUps[0].sessionId).toBe(s.id);
  });

  it('Export → Import ergibt identische Daten', async () => {
    const data = await Repository.loadAll();
    const json = JSON.stringify(buildExport(data));
    const res = parseImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sessions).toEqual(data.sessions);
      await Repository.replaceAll(res.data);
      expect((await Repository.loadAll()).sessions).toHaveLength(1);
    }
  });

  it('ungültige Importdateien werden abgelehnt', () => {
    expect(parseImport('kein json').ok).toBe(false);
    expect(parseImport(JSON.stringify({ format: 'x' })).ok).toBe(false);
    const bad = buildExport({ profile, settings: DEFAULT_SETTINGS, sessions: [{ ...s, exercises: [{ ...s.exercises[0], exerciseId: 'gibt_es_nicht' }] }], followUps: [], tests: [], adjustments: [] });
    expect(parseImport(JSON.stringify(bad)).ok).toBe(false);
  });

  it('CSV enthält Kopfzeile, maskiert Sonderzeichen und Folgetagswerte', () => {
    const csv = sessionsToCSV({ sessions: [s], followUps: [f] });
    const lines = csv.split('\n');
    expect(lines[0]).toMatch(/^Datum;Einheit-ID;Übung/);
    expect(lines[1]).toContain('Beidbeinige Wadenheber');
    expect(lines[1]).toContain('"Test; mit ""Zeichen"""');
  });

  it('vollständige Löschung entfernt alles', async () => {
    await Repository.deleteEverything();
    const data = await Repository.loadAll();
    expect(data.profile).toBeNull();
    expect(data.sessions).toHaveLength(0);
  });

  it('Löschen einer Einheit entfernt zugehörige Folgetagsabfragen', async () => {
    await Repository.saveSession(s);
    await Repository.saveFollowUp(f);
    await Repository.deleteSession(s.id);
    const data = await Repository.loadAll();
    expect(data.followUps).toHaveLength(0);
  });
});
