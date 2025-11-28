# MERIT EMS Training (React + Firebase + Tailwind)

Interactive shock scenarios for EMS students, with login, progress tracking, and Firestore storage.

## Quick start
- `npm install`
- `npm run dev` (Vite dev server)
- Copy your Firebase config into `src/firebase.ts` (already filled for the current project).

## Scripts
- `npm run dev` — start Vite dev server
- `npm run build` — type-check then build
- `npm run preview` — preview production build
- `npm run lint` — run eslint on the codebase
- `npm run validate:scenarios` — sanity-check scenario graph links

## Data model (Firestore)
- `students` docs: `name`, `email`, `status` ("Active"/"Inactive"), `className`, `lastActivity` (Timestamp). Extra fields are tolerated; missing ones fall back to defaults in the UI.
- `attempts` docs: `studentId` (uid), `scenarioId`, `status` ("In Progress"/"Complete"/etc.), `score`, `passed`, `studentName`, `scenarioTitle`, `notes`, `attemptedAt` (Timestamp). The scenario player now auto-saves progress and completion.

## Features
- Auth gate via Firebase Auth (email/password)
- Scenario dashboard listing Firestore `scenarios` docs
- Interactive shock scenario player with auto-save to Firestore attempts
- Student tracking view (students + recent attempts)
- Scenario result page to manually log an attempt

## Tech stack
- React 19 + React Router 7
- TypeScript + Vite
- Tailwind CSS
- Firebase Auth + Firestore
