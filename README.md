# Canela Corporation Database Portal

Phase 1 establishes the production frontend foundation, Firebase connection, username/password authentication, one-time activation flow, persistent cross-device access, protected routing, technical system roles, and initial Firestore rules.

## Setup

1. Install Node.js 20+.
2. Run `npm install`.
3. In Firebase Authentication enable **Email/Password** and **Anonymous** providers.
4. Create Firestore in production mode.
5. Deploy rules with `firebase deploy --only firestore`.
6. Run `npm run dev`.

## Authentication model

Users see only a portal username. Internally it maps to a non-deliverable Firebase Auth alias ending in `@accounts.canela.internal`. No user email is collected or used. An administrator creates a SHA-256 activation-code document in `activationCodes`; the user redeems it once, selects a username and password, and can then sign in from any device.

## Bootstrap the first administrator

The first System Owner must be bootstrapped manually in Firebase. Create the Auth account with the internal alias, then create `portalAccounts/{uid}` with:

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

The Phase 2 account manager will generate activation codes in the UI. Until then, activation records may be inserted manually using a SHA-256 hash of the displayed code as the document ID.

## Security note

The Firebase web API key is intentionally public configuration and is protected by Authentication, App Check, and Firestore Security Rules—not by secrecy. Configure authorized domains and App Check before launch.
