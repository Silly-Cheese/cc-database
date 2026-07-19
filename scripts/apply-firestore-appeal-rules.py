from pathlib import Path
import subprocess

BASE_COMMIT = "e967b9d30c524910de7e1d1fd4962feea3436512"
RULES_PATH = Path("firestore.rules")

original = subprocess.check_output(
    ["git", "show", f"{BASE_COMMIT}:firestore.rules"],
    text=True,
)

old_portal_update = """      allow update: if systemAdministrator()
        && (
          !('SYSTEM_OWNER' in resource.data.systemRoles)
          || systemOwner()
        );
"""

new_portal_update = """      allow update: if (
        systemAdministrator()
        && (
          !('SYSTEM_OWNER' in resource.data.systemRoles)
          || systemOwner()
        )
      ) || (
        hasPermission('appeals.review')
        && resource.data.portalStatus != 'ACTIVE'
        && request.resource.data.portalStatus == 'ACTIVE'
        && onlyChanges([
          'portalStatus',
          'reactivatedAt',
          'reactivatedBy',
          'reactivatedByName',
          'statusChangedAt',
          'statusChangedBy'
        ])
        && request.resource.data.reactivatedBy == request.auth.uid
        && request.resource.data.statusChangedBy == request.auth.uid
      );
"""

if old_portal_update not in original:
    raise RuntimeError("Expected portalAccounts update block was not found.")

updated = original.replace(old_portal_update, new_portal_update, 1)

anchor = """    // ============================================================
    // ANNOUNCEMENTS AND COMMUNICATIONS
    // ============================================================
"""

appeal_rules = """    // ============================================================
    // DEACTIVATION APPEALS
    // ============================================================

    match /deactivationAppeals/{appealId} {
      allow get: if signedIn()
        && (
          resource.data.accountUid == request.auth.uid
          || hasPermission('appeals.review')
        );

      allow list: if signedIn()
        && (
          hasPermission('appeals.review')
          || resource.data.accountUid == request.auth.uid
        );

      allow create: if signedIn()
        && accountExists()
        && account().portalStatus != 'ACTIVE'
        && request.resource.data.accountUid == request.auth.uid
        && request.resource.data.submittedBy == request.auth.uid
        && request.resource.data.appealType == 'ACCOUNT_DEACTIVATION'
        && request.resource.data.status == 'PENDING'
        && request.resource.data.appealTitle is string
        && request.resource.data.appealTitle.size() >= 1
        && request.resource.data.appealTitle.size() <= 100
        && request.resource.data.appealReason is string
        && request.resource.data.appealReason.size() >= 25
        && request.resource.data.contactMethod is string
        && request.resource.data.contactMethod.size() >= 1
        && request.resource.data.displayName is string
        && request.resource.data.portalUsername is string
        && request.resource.data.organizationalRank is string
        && request.resource.data.deactivationReason is string
        && request.resource.data.additionalContext is string
        && request.resource.data.submittedAt == request.time
        && request.resource.data.updatedAt == request.time
        && request.resource.data.keys().hasOnly([
          'appealType',
          'appealTitle',
          'accountUid',
          'displayName',
          'portalUsername',
          'organizationalRank',
          'deactivationReason',
          'appealReason',
          'additionalContext',
          'contactMethod',
          'status',
          'submittedAt',
          'updatedAt',
          'submittedBy'
        ]);

      allow update: if hasPermission('appeals.review')
        && request.resource.data.accountUid == resource.data.accountUid
        && request.resource.data.submittedBy == resource.data.submittedBy
        && request.resource.data.appealType == resource.data.appealType
        && request.resource.data.submittedAt == resource.data.submittedAt
        && request.resource.data.status in [
          'PENDING',
          'NEEDS_INFORMATION',
          'APPROVED',
          'DENIED'
        ]
        && onlyChanges([
          'status',
          'assignedReviewer',
          'assignedReviewerName',
          'assignedAt',
          'reviewNotes',
          'decisionReason',
          'reviewedAt',
          'reviewedBy',
          'reviewedByName',
          'updatedAt'
        ])
        && request.resource.data.assignedReviewer == request.auth.uid
        && request.resource.data.reviewedBy == request.auth.uid
        && request.resource.data.updatedAt == request.time;

      allow delete: if systemAdministrator();

      match /messages/{messageId} {
        allow read: if signedIn()
          && (
            get(/databases/$(database)/documents/deactivationAppeals/$(appealId)).data.accountUid
              == request.auth.uid
            || hasPermission('appeals.review')
          );

        allow create: if signedIn()
          && request.resource.data.authorUid == request.auth.uid
          && request.resource.data.message is string
          && request.resource.data.message.size() >= 1
          && request.resource.data.createdAt == request.time
          && (
            get(/databases/$(database)/documents/deactivationAppeals/$(appealId)).data.accountUid
              == request.auth.uid
            || hasPermission('appeals.review')
          );

        allow update: if false;
        allow delete: if systemAdministrator();
      }
    }

"""

if anchor not in updated:
    raise RuntimeError("Announcements section anchor was not found.")

updated = updated.replace(anchor, appeal_rules + anchor, 1)
RULES_PATH.write_text(updated, encoding="utf-8")

line_count = len(updated.splitlines())
if line_count < 1000:
    raise RuntimeError(f"Unexpectedly short rules file: {line_count} lines")

print(f"Wrote {line_count} lines to {RULES_PATH}")
