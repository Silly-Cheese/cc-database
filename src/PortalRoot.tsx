import { NavLink, Route, Routes } from 'react-router-dom';
import { BriefcaseBusiness, Scale } from 'lucide-react';
import App from './App';
import PhaseThree from './PhaseThree';
import PhaseFour from './PhaseFour';
import { useAuth } from './AuthContext';

export default function PortalRoot(){const {user,account}=useAuth();const active=Boolean(user&&account?.portalStatus==='ACTIVE');return <>{active&&<div className="module-launcher"><NavLink to="/compliance"><Scale/>Compliance</NavLink><NavLink to="/workforce"><BriefcaseBusiness/>Workforce & HR</NavLink></div>}<Routes><Route path="/compliance" element={<main className="standalone-module"><PhaseThree/></main>}/><Route path="/workforce" element={<main className="standalone-module"><PhaseFour/></main>}/><Route path="/*" element={<App/>}/></Routes></>}
