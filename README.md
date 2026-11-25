# RehaKompass – adaptive Reha- und Trainings-App nach Tibia-/Fibulafraktur

Lokale, offlinefähige Progressive Web App (React + TypeScript + Vite) mit deterministischer, nachvollziehbarer Trainingssteuerung.

> **Wichtig:** Die App ist kein Medizinprodukt. Sie stellt keine Diagnosen und erteilt keine Freigaben. Dokumentierte Vorgaben von Ärzt:innen/Physiotherapeut:innen sind verbindliche Grenzen. Alle Grenzwerte sind technische Startparameter (`src/engine/config.ts`), keine medizinisch validierten Werte.

## Starten

```bash
npm install
npm run dev        # Entwicklung (http://localhost:5173)
npm test           # 55 automatisierte Tests (Engines, Simulation, Speicher)
npm run build      # Typprüfung + Produktions-Build inkl. Service Worker (dist/)
npm run preview    # Produktions-Build lokal ausliefern
npm run simulate   # Simulation aus Abschnitt 25 im Terminal
node scripts/e2e-smoke.cjs   # Browser-End-to-End-Test gegen `npm run preview` (Playwright)
```

Installation auf dem Smartphone: App im Browser öffnen → „Zum Startbildschirm hinzufügen“. Nach dem ersten Laden funktioniert alles offline.

## Funktionen

| Bereich | Umsetzung |
|---|---|
| Onboarding | Verletzung/OP, 8 Freigaben (Status, Datum, Quelle, Einschränkungen), Belastbarkeit, Ziele → vorläufiger Ausgangsstatus |
| Heute | Tagesplan des Schedulers mit Begründung je Übung, gesperrte Inhalte mit Grund |
| Training | Schritt-für-Schritt-Logging, Werte vorausgefüllt (nur bestätigen oder abweichen), Timer, Warnzeichen-Abbruch, automatische Zwischenspeicherung |
| Folgetag-Check | „Wie hat dein Bein auf die gestrige Belastung reagiert?“ erscheint beim nächsten Öffnen der App |
| Fortschritt | 7/14/28 Tage/Gesamt, datenbasierte Aussagen, Diagramme, Regionenentwicklung, Entscheidungslog |
| Übungsbibliothek | 55 Übungen, 8 Kategorien, Ausführung, Fehler, Sicherheit, Progressionspfad, Regionenmodell, schematische Illustrationen |
| Belastungsprofil | Anatomische Belastungsmatrix, funktionelle Bereitschaft, Funktionstests, Laufmodul A–K, Return-to-Football (12 Phasen) |
| Verlauf | Einheiten inkl. Score, Recovery, Belastung, Entscheidung, Begründung; Bearbeiten/Löschen |
| Einstellungen | Profil, Freigaben, Theme (hell/dunkel/System), JSON-Export/-Import, CSV-Export, vollständige Löschung, Simulation |

Nicht umgesetzt (bewusst): Push-Benachrichtigungen (würden einen Server erfordern) – die Folgetagsabfrage erscheint stattdessen in der App.

## Architektur

```
src/
  domain/types.ts            Datenmodell (UI-unabhängig)
  data/exercises.ts          Übungsdatenbank
  engine/                    Kernlogik – rein funktional, ohne UI/Browser testbar
    config.ts                alle Schwellen & Faktoren (konfigurierbar)
    userProfileEngine.ts     Profil, Ausgangsstatus, Startvarianten
    medicalRestrictionsEngine.ts  Freigaben (nur „granted“ zählt)
    safetyGateEngine.ts      Warnzeichen, Schienbeinschmerz, Progressions-Gate
    recoveryAssessmentEngine.ts   Ampel green/yellow/orange/red
    progressionScore.ts      Score 0–100 (fehlende Daten = 0 Punkte)
    loadManagementEngine.ts  relatives Belastungsmodell, 7/14/28-Tage, Spitzen
    exerciseProgressionEngine.ts  Replay je Übungsfamilie, 1 Variable pro Schritt
    runningProgressionEngine.ts   Laufstufen A–K
    functionalReadinessEngine.ts  Bereitschaftsprofil (Entscheidungshilfe)
    returnToFootballEngine.ts     12 Phasen
    trainingScheduler.ts     Tagesplan
    decisionExplanationEngine.ts  deutsche Begründungen aus Reason-Codes
    analyticsEngine.ts       Zeitreihen & Wochenanalyse
    rehabEngine.ts           Fassade: verbindet alle Module
    simulation.ts            Testfall Abschnitt 25
  storage/                   IndexedDB (idb), Export/Import/CSV
  ui/                        React-Oberfläche
tests/                       Vitest
docs/ENTSCHEIDUNGEN.md       wichtigste technische Entscheidungen
```

Siehe [`docs/ENTSCHEIDUNGEN.md`](docs/ENTSCHEIDUNGEN.md) für die Regeln der Trainingssteuerung.
