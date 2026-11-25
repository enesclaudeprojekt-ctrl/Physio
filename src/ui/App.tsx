import { useApp, useRoute } from './AppState';
import { Icon } from './components/ui';
import { Onboarding } from './screens/Onboarding';
import { Dashboard } from './screens/Dashboard';
import { Today } from './screens/Today';
import { Workout } from './screens/Workout';
import { FollowUp, History, SessionDetail, Summary } from './screens/Sessions';
import { Progress } from './screens/Progress';
import { ExerciseDetail, Library } from './screens/Library';
import { LoadProfile } from './screens/LoadProfile';
import { Settings } from './screens/Settings';

const NAV = [
  { id: 'dashboard', label: 'Start', icon: 'home' },
  { id: 'today', label: 'Heute', icon: 'today' },
  { id: 'progress', label: 'Fortschritt', icon: 'progress' },
  { id: 'library', label: 'Übungen', icon: 'library' },
  { id: 'load', label: 'Belastung', icon: 'load' },
  { id: 'history', label: 'Verlauf', icon: 'history' },
  { id: 'settings', label: 'Mehr', icon: 'settings' }
];

export function App() {
  const { loading, error, data, evaluation } = useApp();
  const [route, nav] = useRoute();

  if (loading) return <div className="app"><p className="muted center" style={{ paddingTop: 80 }}>Lade lokale Daten …</p></div>;
  if (error) return <div className="app"><div className="banner danger">{error}</div></div>;
  if (!data.profile?.onboardingCompleted) return <div className="app"><Onboarding /></div>;
  if (!evaluation) return <div className="app"><div className="banner danger">Die Auswertung konnte nicht berechnet werden. Bitte Daten in den Einstellungen prüfen oder eine Sicherung importieren.</div><Settings /></div>;

  const [r0, r1] = route;
  let screen;
  switch (r0) {
    case 'today': screen = <Today />; break;
    case 'workout': screen = <Workout />; break;
    case 'summary': screen = <Summary id={r1} />; break;
    case 'followup': screen = <FollowUp sessionId={r1} />; break;
    case 'progress': screen = <Progress />; break;
    case 'library': screen = r1 ? <ExerciseDetail id={r1} /> : <Library />; break;
    case 'load': screen = <LoadProfile />; break;
    case 'history': screen = r1 ? <SessionDetail id={r1} /> : <History />; break;
    case 'settings': screen = <Settings sub={r1} />; break;
    default: screen = <Dashboard />;
  }
  const active = r0 === 'workout' || r0 === 'summary' || r0 === 'followup' ? 'today' : r0 || 'dashboard';

  return (
    <>
      <main className="app">{screen}</main>
      <nav className="bottomnav" aria-label="Hauptnavigation">
        <div className="bottomnav-inner">
          {NAV.map((n) => (
            <button key={n.id} className={`navbtn ${active === n.id ? 'active' : ''}`} onClick={() => nav(n.id)} aria-current={active === n.id ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
