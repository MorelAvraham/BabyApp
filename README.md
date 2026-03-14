# BabyTracker PWA

BabyTracker is a mobile-first Progressive Web App built to help parents and caregivers manage a baby's daily routine in one shared, real-time experience.

The project focuses on fast logging, clear mobile UX, offline resilience, and smooth collaboration across multiple caregivers.

## Overview

This app was designed as a practical, production-style PWA rather than a simple demo. It combines an installable home-screen experience, Firebase-backed synchronization, and a custom RTL interface tailored for day-to-day baby care tracking.

## Core Features

- Shared caregiver tracking with real-time updates
- Daily event logging for sleep, wake, meals, diaper changes, medication, and tastings
- Visual day timeline for sleep and key care activity
- Milestones tracking with age-aware context
- Health tools for growth entries, medical notes, and pumping logs
- Installable offline-first PWA experience
- Hebrew RTL mobile interface with bottom sheets and touch-friendly interactions

## Technical Stack

- Vanilla JavaScript
- HTML5
- CSS3
- Firebase Firestore
- Service Worker
- Web App Manifest

## Product Goals

- Reduce friction in shared baby-care tracking
- Deliver a native-feeling mobile UX without a front-end framework
- Keep the app reliable even with weak or unstable connectivity
- Maintain a simple, portable codebase that can be self-hosted easily

## Local Development

This project is a static web app and can be served locally with any lightweight static server.

```bash
npx serve .
```

After starting the server, open the local URL in your browser.

## Firebase Configuration

To connect the app to your own Firebase project:

1. Create a Firebase project
2. Enable Firestore
3. Replace the `FIREBASE_CONFIG` object in [`app.js`](./app.js) with your own credentials

## PWA Update Behavior

Installed users receive updates automatically after a new production deploy.

The app is configured to:

- check for a newer service worker on load
- reload when the new worker becomes active
- fetch core app shell files with a network-first strategy

In practice, the release flow is now:

1. push code
2. deploy to production
3. users reopen or refresh the app

No manual cache-version bump is required for normal releases.

## Positioning

This repository represents a polished personal product case study in:

- PWA architecture
- mobile-first UX
- offline-aware front-end engineering
- real-time state synchronization
- RTL interface design
