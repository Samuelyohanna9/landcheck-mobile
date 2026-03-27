# LC Green Mobile

Native mobile workspace for `LandCheck Green`, built with Expo/React Native for Android and iOS local testing.

## Project structure

- `src/api`: backend client and endpoint wrappers
- `src/context`: auth, session, and privacy state
- `src/navigation`: root stack and mode-specific tabs
- `src/screens`: Green, auth, and common screens
- `src/storage`: secure session storage, privacy markers, SQLite cache
- `src/theme`: colors, spacing, and navigation theme
- `src/types`: shared mobile domain types

## Run locally

```bash
cd landcheck-mobile
npm run start
```

Then:

- press `a` for Android emulator
- press `i` for iOS simulator on macOS
- or scan the QR code with Expo Go for phone testing

## Native builds for deeper device testing

```bash
npm run prebuild
npm run android:native
npm run ios:native
```

## Current scope

Current mobile scope in this workspace:

- Green mobile:
  - login
  - project visibility
  - assigned task visibility and editing
  - GPS capture
  - camera and photo-library evidence
  - SQLite-backed offline cache
  - offline queue for:
    - tree capture
    - task update
    - task submit for review
  - automatic replay when connectivity returns
