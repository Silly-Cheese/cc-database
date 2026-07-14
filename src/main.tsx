import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import PortalRoot from './PortalRoot';
import './styles.css';
import './phase3.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><PortalRoot/></AuthProvider></BrowserRouter></React.StrictMode>);