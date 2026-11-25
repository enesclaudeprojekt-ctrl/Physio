import type { MedicalClearance } from '../../domain/types';
import { Field, Seg } from '../components/ui';
import { todayISO } from '../../utils/date';

export function ClearanceEditor({ value, onChange }: { value: MedicalClearance; onChange: (c: MedicalClearance) => void }) {
  return (
    <div>
      <Seg
        value={value.status}
        options={[
          { value: 'granted', label: 'Ja, freigegeben' },
          { value: 'denied', label: 'Nein' },
          { value: 'unknown', label: 'Unbekannt' }
        ]}
        onChange={(status) => onChange({ ...value, status, date: status === 'granted' && !value.date ? todayISO() : value.date })}
      />
      {value.status !== 'unknown' && (
        <div className="grid2">
          <Field label="Datum">
            <input className="input" type="date" value={value.date ?? ''} onChange={(e) => onChange({ ...value, date: e.target.value || undefined })} />
          </Field>
          <Field label="Quelle">
            <input className="input" value={value.source ?? ''} placeholder="Arzt / Physio" onChange={(e) => onChange({ ...value, source: e.target.value })} />
          </Field>
        </div>
      )}
      {value.status !== 'unknown' && (
        <Field label="Einschränkungen">
          <input className="input" value={value.restrictions ?? ''} placeholder="optional" onChange={(e) => onChange({ ...value, restrictions: e.target.value })} />
        </Field>
      )}
    </div>
  );
}
