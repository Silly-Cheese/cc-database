import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let rendering = false;
let lastRenderedUid = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

async function safeCollection(name) {
  try {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  } catch {
    return [];
  }
}

function has(account, permission) {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes(permission);
}

function moduleCard({ icon, title, description, target, accent, visible = true, badge = '' }) {
  if (!visible) return '';
  return `<button type="button" class="home-module-card ${accent}" data-home-target="${esc(target)}">
    <span class="home-module-icon">${icon}</span>
    <span class="home-module-copy"><strong>${esc(title)}</strong><small>${esc(description)}</small></span>
    ${badge ? `<b>${esc(badge)}</b>` : '<i>→</i>'}
  </button>`;
}

function statCard(icon, label, value, note, className = '') {
  return `<article class="home-stat-card ${className}"><span>${icon}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong><p>${esc(note)}</p></div></article>`;
}

function dateGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function clickNavigation(target) {
  const direct = document.querySelector(`[data-view="${CSS.escape(target)}"]`);
  if (direct) return direct.click();

  const selectors = {
    quota: '[data-quota-center]',
    performance: '[data-performance-center]',
    internship: '[data-internship-center]',
    appeals: '[data-appeal-center]'
  };
  const special = document.querySelector(selectors[target] || '.__missing__');
  if (special) return special.click();

  const labels = {
    quota: 'Quota Center', performance: 'Performance Center', internship: 'Internship Center',
    appeals: 'Appeal Center', training: 'Training & HR', policies: 'Policies', system: 'System Admin'
  };
  const fallback = [...document.querySelectorAll('#sidebar .nav-item')]
    .find(button => button.textContent.trim().includes(labels[target] || target));
  fallback?.click();
}

async function renderDashboard() {
  if (rendering) return;
  const main = document.querySelector('.layout > main');
  const hero = main?.querySelector('.hero');
  if (!main || !hero || !/^Welcome,/i.test(hero.querySelector('h1')?.textContent || '')) return;

  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  if (main.dataset.modernDashboard === 'loading') return;
  main.dataset.modernDashboard = 'loading';
  rendering = true;

  try {
    const accountSnapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    const account = accountSnapshot.exists() ? accountSnapshot.data() : {};
    const [staff, cases, appeals, alliances, quotaSubmissions, internshipEnrollments, internshipTasks, performanceReviews, courses, documents] = await Promise.all([
      safeCollection('staffProfiles'),
      safeCollection('disciplinaryCases'),
      safeCollection('appeals'),
      safeCollection('alliances'),
      safeCollection('quotaSubmissions'),
      safeCollection('internshipEnrollments'),
      safeCollection('internshipTasks'),
      safeCollection('performanceReviews'),
      safeCollection('courses'),
      safeCollection('documents')
    ]);

    const pendingQuota = quotaSubmissions.filter(item => String(item.status || '').toUpperCase() === 'PENDING').length;
    const pendingInternship = internshipTasks.filter(item => String(item.status || '').toUpperCase() === 'SUBMITTED').length;
    const activeInterns = internshipEnrollments.filter(item => !['COMPLETED', 'UNSUCCESSFUL', 'WITHDRAWN', 'CANCELLED'].includes(String(item.standing || item.status || '').toUpperCase())).length;
    const openCases = cases.filter(item => !['CLOSED', 'RESOLVED', 'DISMISSED'].includes(String(item.status || '').toUpperCase())).length;
    const pendingAppeals = appeals.filter(item => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(item.status || '').toUpperCase())).length;
    const activeReviews = performanceReviews.filter(item => !['COMPLETED', 'FINALIZED', 'CANCELLED'].includes(String(item.status || '').toUpperCase())).length;
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const name = account.displayName || account.portalUsername || 'Staff Member';

    main.innerHTML = `<div class="modern-home">
      <section class="home-welcome">
        <div class="home-welcome-copy">
          <p>CANELA CORPORATION · OPERATIONS PORTAL</p>
          <h1>${esc(dateGreeting())}, ${esc(name)}</h1>
          <span>${esc(today)}</span>
          <div class="home-account-meta">
            <b>${esc(account.organizationalRank || 'Staff')}</b>
            <i>Active account</i>
          </div>
        </div>
        <div class="home-welcome-mark"><span>CC</span><small>One portal.<br>Every operation.</small></div>
      </section>

      <section class="home-section">
        <div class="home-section-head"><div><p>LIVE ORGANIZATIONAL OVERVIEW</p><h2>At a glance</h2></div><span>Updated when this page loads</span></div>
        <div class="home-stat-grid">
          ${statCard('👥', 'Staff profiles', staff.length, 'People in the directory', 'mint')}
          ${statCard('⚖', 'Open cases', openCases, `${cases.length} total recorded`, 'blue')}
          ${statCard('📝', 'Pending appeals', pendingAppeals, `${appeals.length} total appeals`, 'pink')}
          ${statCard('🤝', 'Alliances', alliances.length, 'Partnership records', 'lavender')}
          ${statCard('🎯', 'Quota reviews', pendingQuota, 'Awaiting a decision', 'gold')}
          ${statCard('🎓', 'Active interns', activeInterns, `${pendingInternship} task reviews pending`, 'teal')}
          ${statCard('📈', 'Performance reviews', activeReviews, 'Currently in progress', 'violet')}
          ${statCard('📚', 'Knowledge base', courses.length + documents.length, `${courses.length} courses · ${documents.length} documents`, 'sky')}
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head"><div><p>QUICK ACCESS</p><h2>Portal modules</h2></div><span>Only authorized modules are shown in navigation</span></div>
        <div class="home-module-grid">
          ${moduleCard({ icon:'👥', title:'Staff Directory', description:'Profiles, ranks, departments, and staff records.', target:'staff', accent:'mint' })}
          ${moduleCard({ icon:'↕', title:'Personnel', description:'Personnel actions, promotions, resignations, and history.', target:'personnel', accent:'blue' })}
          ${moduleCard({ icon:'⚖', title:'Compliance', description:'Cases, offences, discipline, blacklists, and investigations.', target:'compliance', accent:'pink', badge: openCases ? `${openCases} open` : '' })}
          ${moduleCard({ icon:'🤝', title:'Alliances', description:'Partnerships, representatives, actions, and strikes.', target:'alliances', accent:'gold' })}
          ${moduleCard({ icon:'◉', title:'Quota Center', description:'Requirements, submissions, reviews, and live workforce status.', target:'quota', accent:'teal', visible: has(account,'quotas.manage') || has(account,'quotas.review') || true, badge: pendingQuota ? `${pendingQuota} pending` : '' })}
          ${moduleCard({ icon:'📈', title:'Performance Center', description:'Reviews, workflows, templates, evaluations, and reports.', target:'performance', accent:'violet', visible: has(account,'performance.access') || has(account,'performance.review.manage') || has(account,'performance.review.view_assigned') })}
          ${moduleCard({ icon:'🎓', title:'Training & HR', description:'Courses, certifications, goals, attendance, and workforce tools.', target:'training', accent:'sky' })}
          ${moduleCard({ icon:'🎓', title:'Internship Center', description:'Programs, enrollments, tasks, reviews, and intern progress.', target:'internship', accent:'lavender', visible: has(account,'internships.access') || has(account,'internships.manage') || has(account,'internships.participate'), badge: pendingInternship ? `${pendingInternship} review` : '' })}
          ${moduleCard({ icon:'📚', title:'Policy Library', description:'Policies, procedures, documents, and organizational resources.', target:'policies', accent:'mint' })}
          ${moduleCard({ icon:'⚖', title:'Appeal Center', description:'Review and manage account, disciplinary, and other appeals.', target:'appeals', accent:'pink', visible: has(account,'appeals.review') || true, badge: pendingAppeals ? `${pendingAppeals} pending` : '' })}
          ${moduleCard({ icon:'⚙', title:'System Administration', description:'Accounts, authorization, permissions, status, and platform controls.', target:'system', accent:'blue', visible: has(account,'*') || (account.systemRoles || []).some(role => ['SYSTEM_OWNER','SYSTEM_ADMINISTRATOR'].includes(role)) })}
        </div>
      </section>

      <section class="home-bottom-grid">
        <article class="home-focus-card">
          <div class="home-section-head"><div><p>MANAGEMENT FOCUS</p><h2>Items needing attention</h2></div></div>
          <div class="home-focus-list">
            <button data-home-target="quota"><span>🎯</span><div><strong>${pendingQuota} quota submission${pendingQuota === 1 ? '' : 's'}</strong><small>Waiting for review</small></div><i>→</i></button>
            <button data-home-target="internship"><span>🎓</span><div><strong>${pendingInternship} internship task${pendingInternship === 1 ? '' : 's'}</strong><small>Submitted for supervisor review</small></div><i>→</i></button>
            <button data-home-target="appeals"><span>⚖</span><div><strong>${pendingAppeals} pending appeal${pendingAppeals === 1 ? '' : 's'}</strong><small>Awaiting administrative action</small></div><i>→</i></button>
            <button data-home-target="performance"><span>📈</span><div><strong>${activeReviews} active performance review${activeReviews === 1 ? '' : 's'}</strong><small>Currently moving through workflows</small></div><i>→</i></button>
          </div>
        </article>
        <article class="home-profile-card">
          <p>YOUR ACCESS</p><h2>${esc(account.organizationalRank || 'Staff Member')}</h2>
          <div><span>Portal username</span><strong>@${esc(account.portalUsername || 'unknown')}</strong></div>
          <div><span>Account status</span><strong>${esc(account.portalStatus || 'ACTIVE')}</strong></div>
          <div><span>Permissions</span><strong>${(account.permissions || []).includes('*') ? 'Full platform access' : `${(account.permissions || []).length} assigned`}</strong></div>
          <button type="button" data-home-target="system">Manage account access <i>→</i></button>
        </article>
      </section>
    </div>`;

    main.dataset.modernDashboard = 'ready';
    lastRenderedUid = user.uid;
    main.querySelectorAll('[data-home-target]').forEach(button => {
      button.addEventListener('click', () => clickNavigation(button.dataset.homeTarget));
    });
  } catch (error) {
    console.error('Unable to render modern dashboard.', error);
    main.dataset.modernDashboard = '';
  } finally {
    rendering = false;
  }
}

const observer = new MutationObserver(() => {
  const main = document.querySelector('.layout > main');
  if (main?.querySelector('.hero') && main.dataset.modernDashboard !== 'loading') renderDashboard();
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
window.addEventListener('canela-account-status-changed', () => { lastRenderedUid = null; renderDashboard(); });
renderDashboard();
