import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let running = false;
let completed = false;

function canManageQuotas() {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes('quotas.manage');
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodEnd(start, frequency) {
  const end = new Date(start);
  const type = String(frequency || 'MONTHLY').toUpperCase();

  if (type === 'WEEKLY') end.setDate(end.getDate() + 6);
  else if (type === 'QUARTERLY') {
    end.setMonth(end.getMonth() + 3);
    end.setDate(end.getDate() - 1);
  } else if (type === 'ONE_TIME') end.setMonth(end.getMonth() + 1);
  else {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  }

  end.setHours(23, 59, 59, 999);
  return end;
}

function periodTitle(definition, start, end) {
  const title = definition.title || 'Quota';
  const format = value => value.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${title} · ${format(start)} – ${format(end)}`;
}

async function createMissingPeriods() {
  if (running || completed || !canManageQuotas()) return;
  const quotaCenter = document.querySelector('.quota-center');
  if (!quotaCenter) return;

  running = true;
  try {
    const [definitionSnapshot, periodSnapshot] = await Promise.all([
      getDocs(collection(db, 'quotaDefinitions')),
      getDocs(collection(db, 'quotaPeriods')),
    ]);

    const definitions = definitionSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => String(item.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
    const periods = periodSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));

    const missing = definitions.filter(definition =>
      !periods.some(period => period.quotaDefinitionId === definition.id
        && String(period.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    );

    if (!missing.length) {
      completed = true;
      return;
    }

    const start = startOfToday();
    await Promise.all(missing.map(async definition => {
      const end = periodEnd(start, definition.frequency);
      await addDoc(collection(db, 'quotaPeriods'), {
        quotaDefinitionId: definition.id,
        title: periodTitle(definition, start, end),
        requiredAmount: Number(definition.requiredAmount || 1),
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        status: 'ACTIVE',
        autoCreated: true,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
    }));

    completed = true;
    location.reload();
  } catch (error) {
    console.error('Unable to create missing quota periods.', error);
  } finally {
    running = false;
  }
}

let timer;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(createMissingPeriods, 180);
}

new MutationObserver(schedule).observe(document.getElementById('app'), {
  childList: true,
  subtree: true,
});

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    account = snapshot.exists() ? snapshot.data() : null;
    schedule();
  } catch (error) {
    console.error('Unable to initialize quota period repair.', error);
  }
});
