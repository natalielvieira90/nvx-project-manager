import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { ProvedorAvisos } from './components/Avisos.tsx';
import { ProvedorCronometro } from './lib/cronometro.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorAvisos>
        <ProvedorCronometro>
          <App />
        </ProvedorCronometro>
      </ProvedorAvisos>
    </BrowserRouter>
  </StrictMode>,
);
