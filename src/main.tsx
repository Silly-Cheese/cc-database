import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import PortalRoot from './PortalRoot';
import './styles.css';
import './phase3.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <PortalRoot />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
