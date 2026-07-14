import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDXxh48yiFHMqL4dH82-fTg0dZXqFi1ud4',
  authDomain: 'cc-database-19dba.firebaseapp.com',
  projectId: 'cc-database-19dba',
  appId: '1:793192077235:web:ff335960e78a39ac971dc6',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);
