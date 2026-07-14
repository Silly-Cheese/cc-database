# Canela Corporation Database Portal

The Canela Portal is a React, TypeScript, Firebase Authentication, and Cloud Firestore application for managing Canela staff and organizational operations. The frontend is intended to be deployed through GitHub rather than Firebase Hosting.

## Completed generation phases

### Phase 1 — Foundation and authentication

- Firebase web connection without Firebase Hosting
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

- Course creation, training assignment, progress, passing scores, and monthly requirements
- Certification issue, expiration, and renewal tracking
- Performance reviews with seven scored categories and approval workflows
- Measurable staff goals with progress and deadlines
- Recognition badges, awards, and commendations
- Leave-request submission and approval
- Meeting, training, event, and roll-call attendance
- Document library for policies, handbooks, guides, manuals, and SOPs
- Internal digital forms for incidents, complaints, suggestions, transfers, resignations, and exit interviews
- Direct, department, leadership, and organization-wide messaging
- Notification center and read tracking
- Employee timeline and configurable dashboard-layout collection foundations
- Responsive Compliance and Workforce module launchers
- Expanded Phase 4 Firestore Security Rules

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. In Firebase Authentication, enable **Email/Password** and **Anonymous** providers.
4. Create Cloud Firestore in production mode.
5. Install the Firebase CLI and sign in.
6. Deploy only Firestore rules and indexes with `firebase deploy --only firestore`.
7. Run `npm run dev`.

## Deployment

Firebase Hosting is not configured or used. Build the static frontend with:

```bash
npm run build
```

Deploy the generated `dist` directory using the GitHub-based hosting workflow selected for the project. Firebase supplies Authentication and Firestore only.

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

## Phase 4 Firestore collections

```text
courses
courseAssignments
courseAttempts
courseCertificates
trainingRequirements
certifications
performanceReviews
reviewTemplates
goalAssignments
recognitions
leaveRequests
attendanceRecords
documents
documentVersions
formResponses
internalMessages
notifications
dashboardLayouts
employeeTimeline
```

Existing collections from Phases 1–3 remain in use.

## Security note

The Firebase web API key is public application configuration. Security depends on Firebase Authentication, App Check, authorized domains, and Firestore Security Rules. Configure App Check and authorized domains before launch.