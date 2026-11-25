import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider } from './ui/AppState';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>
);
