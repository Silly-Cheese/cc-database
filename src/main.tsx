import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import App from './App';
import PhaseThree from './PhaseThree';
import './styles.css';
import './phase3.css';

function ComplianceRoute(){const {user,account,loading}=useAuth();if(loading)return <div className="loading">Loading Canela Portal…</div>;if(!user||!account||account.portalStatus!=='ACTIVE')return <Navigate to="/login"/>;return <div className="phase3-shell"><header className="phase3-header"><div><p className="eyebrow">CANELA ADMINISTRATION PORTAL</p><h1>Compliance & External Operations</h1></div><Link className="back-link" to="/dashboard">Return to dashboard</Link></header><main className="phase3-content"><PhaseThree/></main></div>}
function PortalRoot(){const {account}=useAuth();return <>{account?.portalStatus==='ACTIVE'&&<Link className="phase3-launch" to="/compliance">Compliance & Operations</Link>}<Routes><Route path="/compliance" element={<ComplianceRoute/>}/><Route path="/*" element={<App/>}/></Routes></>}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><PortalRoot/></AuthProvider></BrowserRouter></React.StrictMode>);
