import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SoundProvider } from './contexts/SoundContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SoundProvider>
      <App />
    </SoundProvider>
  </StrictMode>,
);
