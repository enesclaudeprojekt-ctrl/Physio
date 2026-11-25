import { runCalfRaiseSimulation } from '../src/engine/simulation';

const rows = runCalfRaiseSimulation();
for (const r of rows) {
  console.log(`\n── Einheit ${r.unit} (${r.date})`);
  console.log(`Eingang:     ${r.input}`);
  console.log(`Score:       ${r.score}/100   Recovery: ${r.recovery}   Belastung: ${r.load} LE`);
  console.log(`Entscheidung:${r.decision}   Neue Vorgabe: ${r.newPrescription}`);
  console.log(`Begründung:  ${r.explanation}`);
}
