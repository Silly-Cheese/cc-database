import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());

const aliasFor = username => `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@accounts.canela.internal`;
const hash = async value => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toUpperCase()))),
).map(byte => byte.toString(16).padStart(2, '0')).join('');

function showMessage(message) {
  const card = document.querySelector('.auth-card');
  if (!card) return alert(message);
  card.querySelector('.activation-fix-message')?.remove();
  card.querySelector('.auth-tabs')?.insertAdjacentHTML('beforebegin', `<div class="alert activation-fix-message">${message}</div>`);
}

async function redeemActivation(event) {
  const formElement = event.target.closest('#activateForm');
  if (!formElement) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const submit = formElement.querySelector('[type="submit"]');
  const form = new FormData(formElement);
  const code = String(form.get('code') || '').trim().toUpperCase();
  const username = String(form.get('username') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const confirmPassword = String(form.get('confirm') || '');

  if (!code || !username || !password) return showMessage('Complete every activation field.');
  if (password !== confirmPassword) return showMessage('Passwords do not match.');
  if (username.length < 4) return showMessage('Your portal username must contain at least four characters.');

  submit.disabled = true;
  submit.textContent = 'Activating…';

  try {
    const codeHash = await hash(code);
    const codeRef = doc(db, 'activationCodes', codeHash);
    const usernameRef = doc(db, 'portalUsernames', username);

    // Firestore permits activation-code reads only to authenticated users.
    // Establish the temporary anonymous session before reading the code.
    const temporary = auth.currentUser?.isAnonymous
      ? { user: auth.currentUser }
      : await signInAnonymously(auth);

    const [codeSnapshot, usernameSnapshot] = await Promise.all([
      getDoc(codeRef),
      getDoc(usernameRef),
    ]);

    if (!codeSnapshot.exists()) throw new Error('That activation code was not found.');
    if (codeSnapshot.data().status !== 'PENDING') throw new Error('That activation code is no longer available.');
    if (usernameSnapshot.exists()) throw new Error('That portal username is already in use.');

    const credential = EmailAuthProvider.credential(aliasFor(username), password);
    const linked = await linkWithCredential(temporary.user, credential);

    await runTransaction(db, async transaction => {
      const freshCode = await transaction.get(codeRef);
      const freshUsername = await transaction.get(usernameRef);
      if (!freshCode.exists() || freshCode.data().status !== 'PENDING') {
        throw new Error('That activation code has already been used or revoked.');
      }
      if (freshUsername.exists()) throw new Error('That portal username is already in use.');

      const invitation = freshCode.data();
      transaction.set(doc(db, 'portalAccounts', linked.user.uid), {
        displayName: invitation.displayName || username,
        portalUsername: username,
        organizationalRank: invitation.organizationalRank || 'Staff Member',
        portalStatus: 'ACTIVE',
        staffProfileId: invitation.staffProfileId || '',
        systemRoles: Array.isArray(invitation.systemRoles) ? invitation.systemRoles : [],
        permissions: Array.isArray(invitation.permissions) ? invitation.permissions : [],
        activationCodeHash: codeHash,
        activatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      transaction.set(usernameRef, {
        uid: linked.user.uid,
        createdAt: serverTimestamp(),
      });
      transaction.update(codeRef, {
        status: 'USED',
        usedByUid: linked.user.uid,
        usedUsername: username,
        usedAt: serverTimestamp(),
      });
    });

    location.reload();
  } catch (error) {
    console.error('Activation failed:', error);
    try { await signOut(auth); } catch {}
    showMessage(error.message || 'Activation failed. Confirm the code and username, then try again.');
    submit.disabled = false;
    submit.textContent = 'Activate account';
  }
}

document.addEventListener('submit', redeemActivation, true);
