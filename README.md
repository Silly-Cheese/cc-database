# Canela Corporation Database Portal

The Canela Portal is a React, TypeScript, Firebase Authentication, and Cloud Firestore application for managing Canela staff and organizational operations.

## Completed generation phases

### Phase 1 — Foundation and authentication

- Firebase connection and Hosting configuration
- Username/password authentication without collecting user email addresses
- One-time activation codes
- Persistent cross-device sign-in
- Protected routes and account-status checks
- System Owner and System Administrator roles
- Initial audit and security-rule foundation

### Phase 2 — Staff and personnel operations

- Role-aware dashboard
- Searchable staff directory
- Roblox and Discord identity records
- Staff statuses and quota progress
- Rank hierarchy, tiers, limits, and quota targets
- Department directory
- Promotion, demotion, transfer, status-change, resignation, and termination requests
- Approval and denial workflow for personnel actions
- Automatic staff-profile updates after approval
- Quota activity submissions, evidence links, review, and point totals
- Organization-wide announcements with priority and audience fields
- Responsive desktop and mobile navigation
- Expanded Firestore Security Rules for every Phase 2 collection

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. In Firebase Authentication, enable **Email/Password** and **Anonymous** providers.
4. Create Cloud Firestore in production mode.
5. Install the Firebase CLI and sign in.
6. Deploy rules and indexes with `firebase deploy --only firestore`.
7. Run `npm run dev`.

## Authentication model

Users enter only a Canela portal username. Internally, the application maps it to a non-deliverable Firebase Auth alias ending in `@accounts.canela.internal`. No user email address is collected, displayed, or used for recovery.

An administrator creates a SHA-256 activation-code document in `activationCodes`. The user redeems it once, chooses a username and password, and may then sign in from any device.

## Bootstrap the first administrator

Create the first Firebase Authentication account with the internal alias, then create `portalAccounts/{uid}`:

```json
{
  "displayName": "Christopher Shelley",
  "portalUsername": "your_username",
  "organizationalRank": "Vice President",
  "portalStatus": "ACTIVE",
  "systemRoles": ["SYSTEM_OWNER", "SYSTEM_ADMINISTRATOR"],
  "permissions": []
}
```

`SYSTEM_ADMINISTRATOR` automatically satisfies Phase 2 management permission checks. Other accounts may receive any of these granular permissions:

```text
staff.manage
organization.manage
personnel.approve
quotas.review
announcements.manage
audit.read
```

## Phase 2 Firestore collections

```text
staffProfiles
ranks
departments
teams
personnelActions
quotaSubmissions
announcements
portalAccounts
portalUsernames
activationCodes
auditLogs
systemSettings
```

## Security note

The Firebase web API key is public application configuration. Security depends on Firebase Authentication, App Check, authorized domains, and Firestore Security Rules. Configure App Check and authorized domains before launch.
