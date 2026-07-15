import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const auth = getAuth(getApp());
if (typeof auth.onAuthStateChanged !== 'function') {
  auth.onAuthStateChanged = callback => onAuthStateChanged(auth, callback);
}
