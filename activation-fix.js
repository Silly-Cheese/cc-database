import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
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

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') return 'That portal username is already in use.';
  if (code === 'auth/weak-password') return 'The password is too weak. Use at least 10 characters.';
  if (code === 'auth/operation-not-allowed') return 'Username/password authentication is not enabled in Firebase Authentication.';
  if (code === 'auth/network-request-failed') return 'The network request failed. Check your connection and try again.';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Firestore denied the activation request. Publish the latest Firestore rules.';
  return error?.message || 'Activation failed. Confirm the code and username, then try again.';
}

async function redeemActivation(event) {
  const formElement = event.target.closest('#activateForm');
  if (!formElement) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const submit = formElement.querySelector('button[type="submit"], button:not([type])');
  const form = new FormData(formElement);
  const code = String(form.get('code') || '').trim().toUpperCase();
  const username = String(form.get('username') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const confirmPassword = String(form.get('confirm') || '');

  if (!code || !username || !password || !confirmPassword) return showMessage('Complete every activation field.');
  if (password !== confirmPassword) return showMessage('Passwords do not match.');
  if (username.length < 4) return showMessage('Your portal username must contain at least four characters.');
  if (password.length < 10) return showMessage('Your password must contain at least 10 characters.');

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Activating…';
  }

  let createdUser = null;

  try {
    // Create the Firebase Authentication account first. This removes the need
    // for Anonymous Authentication to be enabled in the Firebase console.
    if (auth.currentUser) await signOut(auth);
    const credential = await createUserWithEmailAndPassword(auth, aliasFor(username), password);
    createdUser = credential.user;

    const codeHash = await hash(code);
    const codeRef = doc(db, 'activationCodes', codeHash);
    const usernameRef = doc(db, 'portalUsernames', username);

    const [codeSnapshot, usernameSnapshot] = await Promise.all([
      getDoc(codeRef),
      getDoc(usernameRef),
    ]);

    if (!codeSnapshot.exists()) throw new Error('That activation code was not found.');
    if (codeSnapshot.data().status !== 'PENDING') throw new Error('That activation code is no longer available.');
    if (usernameSnapshot.exists()) throw new Error('That portal username is already in use.');

    await runTransaction(db, async transaction => {
      const freshCode = await transaction.get(codeRef);
      const freshUsername = await transaction.get(usernameRef);

      if (!freshCode.exists() || freshCode.data().status !== 'PENDING') {
        throw new Error('That activation code has already been used or revoked.');
      }
      if (freshUsername.exists()) throw new Error('That portal username is already in use.');

      const invitation = freshCode.data();
      transaction.set(doc(db, 'portalAccounts', createdUser.uid), {
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
        uid: createdUser.uid,
        createdAt: serverTimestamp(),
      });

      transaction.update(codeRef, {
        status: 'USED',
        usedByUid: createdUser.uid,
        usedUsername: username,
        usedAt: serverTimestamp(),
      });
    });

    location.reload();
  } catch (error) {
    console.error('Activation failed:', error);

    // Do not leave an unusable Firebase Authentication account behind when
    // the code is invalid or Firestore rejects the transaction.
    if (createdUser) {
      try { await deleteUser(createdUser); } catch (cleanupError) { console.warn('Could not remove incomplete account:', cleanupError); }
    }
    try { await signOut(auth); } catch {}

    showMessage(friendlyError(error));
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Activate account';
    }
  }
}

document.addEventListener('submit', redeemActivation, true);
