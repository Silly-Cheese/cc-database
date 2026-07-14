# Canela Corporation Database Portal

The Canela Portal is a React and TypeScript application that uses Firebase Authentication and Cloud Firestore only. The frontend is deployed through GitHub-based static hosting. Firebase Hosting, Cloud Functions, Cloud Storage, Messaging, and Emulator configuration are not included.

## Completed generation phases

### Phase 1 — Foundation and authentication

- Username/password authentication without collecting user email addresses
- One-time activation codes and persistent cross-device sign-in
- Protected routes, account statuses, technical roles, and audit foundations

### Phase 2 — Staff and personnel operations

- Role-aware dashboard and searchable staff directory
- Roblox and Discord identity records
- Ranks, tiers, limits, departments, teams, and quotas
- Promotions, demotions, transfers, leave, resignations, and terminations
- Announcements and personnel approval workflows

### Phase 3 — Compliance, alliances, and applications

- Offence definitions and disciplinary cases
- Blacklists and appeals
- Alliance profiles, representatives, statuses, and strikes
- Application review, acceptance, denial, and waitlisting

### Phase 4 — Workforce development and HR

- Course creation, assignments, progress, passing scores, and monthly training requirements
- Certification issue, expiration, and renewal tracking
- Performance reviews, goals, recognition, leave, and attendance
- Document library, internal forms, messaging, notifications, and employee timelines
- Responsive Compliance and Workforce modules

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. In Firebase Authentication, enable **Email/Password** and **Anonymous** providers.
4. Create Cloud Firestore in production mode.
5. Run `npm run dev`.

## Firestore configuration

The Firebase CLI configuration contains Firestore only:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Deploy only the security rules when they change:

```bash
firebase deploy --only firestore:rules
```

`firestore.indexes.json` contains no composite indexes. Firestore's automatic single-field indexes are used instead. Portal queries should avoid compound filter-and-sort combinations that require composite indexes; manageable result sets are filtered and sorted in the React client.

## Deployment

Build the static frontend with:

```bash
npm run build
```

Deploy the generated `dist` directory through the selected GitHub-based hosting workflow. Firebase Hosting is not configured or used.

## Authentication model

Users enter only a Canela portal username. Internally, the application maps it to a non-deliverable Firebase Authentication alias ending in `@accounts.canela.internal`. No user email address is collected, displayed, or used for recovery.

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

`SYSTEM_ADMINISTRATOR` satisfies every portal-management permission check. Granular permissions include:

```text
staff.manage
organization.manage
personnel.approve
quotas.review
announcements.manage
discipline.manage
blacklists.manage
appeals.review
alliances.manage
applications.review
training.manage
training.assign
training.grade
reviews.manage
reviews.submit
reviews.approve
goals.manage
recognitions.manage
leave.approve
attendance.manage
documents.manage
forms.manage
messages.manage
audit.read
```

## Security note

The Firebase web API key is public application configuration. Security depends on Firebase Authentication, authorized domains, and Firestore Security Rules. Only Authentication and Firestore are initialized by the application.
