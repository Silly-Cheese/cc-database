import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { BriefcaseBusiness, Scale } from 'lucide-react';
import App from './App';
import PhaseThree from './PhaseThree';
import PhaseFour from './PhaseFour';
import { useAuth } from './AuthContext';

function ProtectedModule({children}:{children:React.ReactNode}){const {user,account,loading}=useAuth();if(loading)return <div className="loading">Loading Canela Portal…</div>;if(!user||!account||account.portalStatus!=='ACTIVE')return <Navigate to="/login"/>;return <main className="standalone-module">{children}</main>}
export default function PortalRoot(){const {user,account}=useAuth();const active=Boolean(user&&account?.portalStatus==='ACTIVE');return <>{active&&<div className="module-launcher"><NavLink to="/compliance"><Scale/>Compliance</NavLink><NavLink to="/workforce"><BriefcaseBusiness/>Workforce & HR</NavLink></div>}<Routes><Route path="/compliance" element={<ProtectedModule><PhaseThree/></ProtectedModule>}/><Route path="/workforce" element={<ProtectedModule><PhaseFour/></ProtectedModule>}/><Route path="/*" element={<App/>}/></Routes></>}
