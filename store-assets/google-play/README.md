# Google Play Store Prep

This folder holds the files and notes needed for the first Google Play submission of `LC Green`.

## Current readiness

- App name: `LC Green`
- Android package: `online.landcheck.mobile`
- Public privacy policy route already exists in the web app:
  - `https://landcheck.online/privacy`
- Play upload artifact:
  - `landcheck-mobile/android/app/build/outputs/bundle/release/app-release.aab`

## Store assets checklist

### Required or strongly recommended

1. App icon
   - already available from app assets
2. Screenshots
   - prepare at least 2 to 4 phone screenshots
   - recommended set:
     - login screen
     - project overview
     - map and add trees
     - offline sync / maintenance workflow
3. Feature graphic
   - final file should be `1024 x 500`
   - prepared source asset in this folder:
     - `feature-graphic-1024x500.png`
4. Privacy policy URL
   - `https://landcheck.online/privacy`

## Screenshot guidance

Use clean production-like data.

Avoid:

- debug overlays
- partially loaded states
- personal emails or phone numbers
- internal test data that looks broken

Recommended Android phone screenshots to capture:

1. Login screen
2. Green overview with both logos visible
3. Map and Add Trees with real project geometry
4. Maintenance or offline sync screen showing field workflow

## Build commands

From `landcheck-mobile`:

```bash
npm run android:bundle:release
```

Output:

- `android/app/build/outputs/bundle/release/app-release.aab`

## Policy notes

The public privacy-policy page already covers:

- GPS/location usage
- camera and photo uploads
- offline cache and sync behavior
- operational/admin data
- retention and deletion contact flow

If the production domain changes, update the privacy-policy URL above before submission.
