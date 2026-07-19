from pathlib import Path

rules_path = Path('firestore.rules')
rules = rules_path.read_text(encoding='utf-8')

permission_helpers_anchor = """function hasPermission(permission) {
return active()
&& account().permissions is list
&& (
systemAdministrator()
|| '*' in account().permissions
|| permission in account().permissions
);
}
"""

permission_helpers = permission_helpers_anchor + """
function performanceCenterAccess() {
return hasPermission('performance.access')
|| hasPermission('performance.review.create')
|| hasPermission('performance.review.self_complete')
|| hasPermission('performance.review.evaluate')
|| hasPermission('performance.review.approve')
|| hasPermission('performance.review.finalize')
|| hasPermission('performance.review.reopen')
|| hasPermission('performance.review.view_assigned')
|| hasPermission('performance.review.view_all')
|| hasPermission('performance.review.manage_templates')
|| hasPermission('performance.review.manage_workflows')
|| hasPermission('performance.review.manage')
|| hasPermission('performance.notes.private')
|| hasPermission('performance.reports.view')
|| hasPermission('performance.reports.export');
}

function performanceDirectoryAccess() {
return hasPermission('performance.review.create')
|| hasPermission('performance.review.evaluate')
|| hasPermission('performance.review.approve')
|| hasPermission('performance.review.finalize')
|| hasPermission('performance.review.view_all')
|| hasPermission('performance.review.manage_templates')
|| hasPermission('performance.review.manage_workflows')
|| hasPermission('performance.review.manage');
}
"""

if 'function performanceCenterAccess()' not in rules:
    if permission_helpers_anchor not in rules:
        raise RuntimeError('Unable to locate hasPermission helper.')
    rules = rules.replace(permission_helpers_anchor, permission_helpers, 1)

old_portal = """match /portalAccounts/{uid} {
allow get: if isSelf(uid) || systemAdministrator();
allow list: if systemAdministrator();
allow create: if validBootstrapAccount(uid)
|| validActivatedAccount(uid);
allow update: if systemAdministrator()
&& (
!('SYSTEM_OWNER' in resource.data.systemRoles)
|| systemOwner()
);
allow delete: if systemOwner()
&& request.auth.uid != uid;
}
"""

new_portal = """match /portalAccounts/{uid} {
allow get: if isSelf(uid) || systemAdministrator();
allow list: if systemAdministrator()
|| performanceDirectoryAccess();
allow create: if validBootstrapAccount(uid)
|| validActivatedAccount(uid);
allow update: if (
systemAdministrator()
&& (
!('SYSTEM_OWNER' in resource.data.systemRoles)
|| systemOwner()
)
) || (
hasPermission('appeals.review')
&& onlyChanges([
'portalStatus',
'reactivatedAt',
'reactivatedBy',
'reactivatedByName',
'statusChangedAt',
'statusChangedBy'
])
&& resource.data.portalStatus == 'DISABLED'
&& request.resource.data.portalStatus == 'ACTIVE'
);
allow delete: if systemOwner()
&& request.auth.uid != uid;
}
"""

if old_portal in rules:
    rules = rules.replace(old_portal, new_portal, 1)
elif 'performanceDirectoryAccess();' not in rules:
    raise RuntimeError('Unable to locate portalAccounts rules.')

old_performance = """match /reviewTemplates/{templateId} {
allow read: if active();
allow create, update: if hasPermission('reviews.manage');
allow delete: if systemAdministrator();
}
match /performanceReviews/{reviewId} {
allow read: if active();
allow create: if hasPermission('reviews.submit');
allow update: if hasPermission('reviews.approve')
|| hasPermission('reviews.manage');
allow delete: if systemAdministrator();
}
"""

new_performance = """match /reviewTemplates/{templateId} {
allow read: if active();
allow create, update: if hasPermission('reviews.manage')
|| hasPermission('performance.review.manage_templates')
|| hasPermission('performance.review.manage');
allow delete: if systemAdministrator()
|| hasPermission('performance.review.manage');
}

match /performanceTemplates/{templateId} {
allow read: if performanceCenterAccess();
allow create, update: if hasPermission('performance.review.manage_templates')
|| hasPermission('performance.review.manage');
allow delete: if systemAdministrator()
|| hasPermission('performance.review.delete')
|| hasPermission('performance.review.manage');
}

match /performanceWorkflows/{workflowId} {
allow read: if performanceCenterAccess();
allow create, update: if hasPermission('performance.review.manage_workflows')
|| hasPermission('performance.review.manage');
allow delete: if systemAdministrator()
|| hasPermission('performance.review.delete')
|| hasPermission('performance.review.manage');
}

match /performanceReviews/{reviewId} {
allow read: if performanceCenterAccess()
|| hasPermission('reviews.submit')
|| hasPermission('reviews.approve')
|| hasPermission('reviews.manage');
allow create: if hasPermission('performance.review.create')
|| hasPermission('performance.review.manage')
|| hasPermission('reviews.submit');
allow update: if hasPermission('performance.review.self_complete')
|| hasPermission('performance.review.evaluate')
|| hasPermission('performance.review.approve')
|| hasPermission('performance.review.finalize')
|| hasPermission('performance.review.reopen')
|| hasPermission('performance.review.manage')
|| hasPermission('reviews.approve')
|| hasPermission('reviews.manage');
allow delete: if systemAdministrator()
|| hasPermission('performance.review.delete')
|| hasPermission('performance.review.manage');
}
"""

if old_performance in rules:
    rules = rules.replace(old_performance, new_performance, 1)
elif 'match /performanceTemplates/{templateId}' not in rules:
    raise RuntimeError('Unable to locate legacy performance rules.')

rules_path.write_text(rules, encoding='utf-8')

appeal_path = Path('appeal-center.js')
appeal = appeal_path.read_text(encoding='utf-8')

appeal = appeal.replace(
"""  getDocs,
  updateDoc,""",
"""  getDocs,
  query,
  where,
  updateDoc,""",
1,
)

old_loader = """async function loadAppeals() {
  const snapshot = await getDocs(collection(db, 'deactivationAppeals'));
  appeals = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => canReview() || item.accountUid === auth.currentUser?.uid)
    .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
}
"""

new_loader = """async function loadAppeals() {
  const appealsRef = collection(db, 'deactivationAppeals');
  const source = canReview()
    ? appealsRef
    : query(appealsRef, where('accountUid', '==', auth.currentUser.uid));
  const snapshot = await getDocs(source);
  appeals = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
}
"""

if old_loader in appeal:
    appeal = appeal.replace(old_loader, new_loader, 1)
elif "where('accountUid', '==', auth.currentUser.uid)" not in appeal:
    raise RuntimeError('Unable to locate Appeal Center loader.')

appeal_path.write_text(appeal, encoding='utf-8')
