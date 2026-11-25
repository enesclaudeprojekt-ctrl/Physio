# Technische Entscheidungen

## 1. Zustand durch „Replay“ statt gespeicherter Zustände
Der Progressionszustand jeder Übungsfamilie wird bei jeder Auswertung **vollständig aus den gespeicherten Protokollen rekonstruiert** (`exerciseProgressionEngine.replayFamily`). Gespeichert werden nur Rohdaten (Einheiten, Folgetagsabfragen, Funktionstests, manuelle Anpassungen).

Vorteile: keine versteckten Zustände, jede Entscheidung reproduzierbar, nachträglich ergänzte Folgetagsdaten oder gelöschte Einheiten werden automatisch korrekt berücksichtigt, keine Migrationsprobleme bei Regeländerungen. Die Datenmengen einer Reha (Hunderte Einheiten) sind dafür klein genug.

## 2. Reihenfolge einer Entscheidung
1. **Warnzeichen** (unabhängig von jedem Score) → Rot → Stopp der Belastung; bei Atemnot/Brustschmerz Notfallhinweis (112). Fortsetzung erst nach Bestätigung „ärztlich abgeklärt“, dann mit reduzierter Vorgabe.
2. **Recovery-Ampel** (Einheit + Folgetag): Orange → Reduktion der zuletzt gesteigerten Variable; Gelb → halten.
3. **Folgetag fehlt** → halten (zählt nicht als verträglich).
4. **Progressionsscore** (Gewichte 25/20/15/10/10/10/10). Fehlende Werte = 0 Punkte. ≥ 85 zählt als verträglich, 70–84 halten, < 70 Zähler zurücksetzen.
5. Erst nach **N verträglichen Einheiten** auf derselben Stufe (Standard 3, Laufen 2) läuft das **Safety-Gate**: Freigaben, Datenvollständigkeit, regionale Belastung (erhöht/Spitze), wiederkehrende Schienbeinschmerzen, anhaltende Beschwerden, Kraftverlust, Gangbild, Beweglichkeit. Ein hoher Score kompensiert nie ein fehlendes Kriterium.
6. **Genau eine Variable** wird verändert, in der übungsspezifischen Reihenfolge (z. B. Wadenheber: Wiederholungen 10 → 12 → 15, Tempo, Sätze; danach Variantenwechsel, sofern Freigaben und Voraussetzungen erfüllt).

## 3. Transparente Adaptivität (kein Machine Learning)
- **Konservativer Modus:** wiederholte Beschwerden direkt nach Steigerungen (≥ 2) → mehr Bestätigungseinheiten und halbe Schritte. Verursacht dieselbe Variable wiederholt Rückschläge, wird eine andere Progressionsform gewählt.
- **Effizienter Modus:** ≥ 3 Steigerungen ohne Rückschlag → eine Bestätigungseinheit weniger (Minimum 2).
- **Trainingspause:** ≥ 14 Tage → ein Schritt zurück, ≥ 28 Tage → zwei Schritte. Die frühere Höchstleistung wird nicht übernommen.
- **Stagnation:** ≥ 8 Einheiten auf derselben Stufe → Hinweis zur Überprüfung.

## 4. Belastungsmodell
`ExerciseLoad = Base × Volume × Intensity × Complexity × Impact × Duration`, mit eigenem Profil für Kraft, Wade, Isometrie, Gehen, Rad, Laufen, Sprünge, Koordination, Mobilisation, Sport. Jede Übung verteilt ihre Last über Gewichte auf 14 anatomische Bereiche. Die 7-Tage-Last wird mit dem Wochendurchschnitt der vorangehenden Wochen verglichen – nur über den Zeitraum mit vorhandener Historie, damit ein Trainingsbeginn nicht als Spitze erscheint. Erhöht ab Faktor 1,5, Spitze ab 2,0 oder bei einer Tageslast > 2,2 × Tagesdurchschnitt. Keine starre 10-%-Regel.

## 5. Scheduler
Sicherheit → bereits trainiert → Regenerationstag (Orange) / Ruhetag (Wochenziel erreicht oder zwei Tage in Folge) → Bausteine (Mobilisation, Fuß, Wade, Kraft A/B im Wechsel, Gleichgewicht, Gehen/Rad, Laufen, Sport) → regionale Belastung (z. B. Spitze an der Achillessehne: isometrische Wade statt Wadenheber, Ergometer statt Gehen) → Zeitbudget (Übungen mit niedriger Priorität entfallen zuerst). Wadenheber und Laufen nie an zwei aufeinanderfolgenden Tagen.

## 6. Freigaben
Nur ausdrücklich als „freigegeben“ dokumentierte Freigaben zählen. Ohne jede Freigabe werden ausschließlich unbelastete Mobilisationsübungen geplant. Lauf-, Sprung- und Fußballinhalte sind technisch vollständig implementiert, bleiben aber standardmäßig gesperrt. Ab Fußballphase 10 ist zusätzlich eine dokumentierte Bestätigung durch Arzt/Physio nötig.

## 7. Speicherung & Datenschutz
IndexedDB (`idb`), jede Eingabe wird sofort gespeichert (auch laufende Einheiten als Entwurf). Keine Netzwerkaufrufe außer dem Laden der App selbst. `navigator.storage.persist()` wird angefragt. Export als versionierte JSON-Sicherung (mit Validierung beim Import) und CSV (Semikolon, UTF-8 BOM für Excel).

## 8. Illustrationen
Selbst erstellte, parametrische Strichfiguren (SVG), blass = Ausgangs-, kräftig = Endposition, betroffenes Bein farbig. Rein schematisch, ohne medizinische Aussagen.
