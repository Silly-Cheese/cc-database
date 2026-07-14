import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

type PortalAccount={displayName:string; portalUsername:string; organizationalRank:string; portalStatus:string; systemRoles:string[]; permissions:string[]};
type AuthState={user:User|null; account:PortalAccount|null; loading:boolean; login:(u:string,p:string)=>Promise<void>; logout:()=>Promise<void>; hasRole:(r:string)=>boolean};
const C=createContext<AuthState|null>(null);
const normalize=(u:string)=>u.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
export const aliasFor=(u:string)=>`${normalize(u)}@accounts.canela.internal`;
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [account,setAccount]=useState<PortalAccount|null>(null);const [loading,setLoading]=useState(true);
useEffect(()=>onAuthStateChanged(auth,async next=>{setUser(next);setAccount(null);if(next){const snap=await getDoc(doc(db,'portalAccounts',next.uid));if(snap.exists())setAccount(snap.data() as PortalAccount);}setLoading(false);}),[]);
const value=useMemo<AuthState>(()=>({user,account,loading,login:async(u,p)=>{await signInWithEmailAndPassword(auth,aliasFor(u),p);},logout:()=>signOut(auth),hasRole:r=>Boolean(account?.systemRoles?.includes(r))}),[user,account,loading]);return <C.Provider value={value}>{children}</C.Provider>}
export const useAuth=()=>{const v=useContext(C);if(!v)throw new Error('useAuth must be inside AuthProvider');return v};
