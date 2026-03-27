# LC Green Mobile

Native mobile workspace for `LandCheck Green`, built with Expo/React Native for Android and iOS local testing.

## What is included

- Native mobile app shell for Green
- Shared API login against the current `landcheck-api`
- Secure session storage
- Privacy consent gate aligned with the current backend consent ledger
- Local SQLite cache for projects, tasks, trees, and sync queue
- Offline tree capture with queued replay
- Offline task update/save and submit-for-review replay
- Native GPS and image capture/picker flows with file-backed offline storage
- Android native project generated in `android/`

## Project structure

- `src/api`: backend client and endpoint wrappers
- `src/context`: auth, session, and privacy state
- `src/navigation`: root stack and mode-specific tabs
- `src/screens`: Green, auth, and common screens
- `src/storage`: secure session storage, privacy markers, SQLite cache
- `src/theme`: colors, spacing, and navigation theme
- `src/types`: shared mobile domain types

## Local setup

1. Start the API locally.
2. Copy `.env.example` to `.env`.
3. Set `EXPO_PUBLIC_API_URL`.
4. Set `EXPO_PUBLIC_MAPBOX_TOKEN`.

Current default for shared testing:

- `https://api.landcheck.online`

Map note for Android/iOS native builds:

- The tree capture screen now uses native Mapbox.
- This package does not work in Expo Go. Test with Android Studio / `expo run:android` / `expo run:ios`.
- Use the same public Mapbox token already used by the web app.

Use a local/LAN API URL only if you specifically want to test against your local backend:

- Android emulator: `http://10.0.2.2:8000`
- iOS simulator on macOS: `http://127.0.0.1:8000`
- Physical Android/iPhone on the same Wi-Fi: `http://YOUR-PC-LAN-IP:8000`

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

Notes:

- Android native builds can be tested locally on Windows if Android Studio is installed.
- iOS native builds require macOS + Xcode.
- On this Windows machine, `expo prebuild` generated `android/`. Generate `ios/` from the same repo on a Mac with `npm run prebuild -- --platform ios`.
- On Windows, iPhone local testing should use Expo Go until you move to a Mac-based iOS native build step.

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

## Next implementation layers

1. Map-backed maintenance task flow
2. Existing-tree polygon workflow
3. Offline map region strategy
4. Background sync hardening
5. Push notifications for new Green tasks
6. Store signing/release pipeline

## Public Android release

For public/shared Android builds, do not use the debug key.

The release build now supports either:

- `android/keystore.properties`
- or environment variables

Copy `landcheck-mobile/android/keystore.properties.example` to:

- `landcheck-mobile/android/keystore.properties`

Then replace the placeholder values with your real keystore details.

If you prefer environment variables, the release build accepts:

- `LANDCHECK_UPLOAD_STORE_FILE`
- `LANDCHECK_UPLOAD_STORE_PASSWORD`
- `LANDCHECK_UPLOAD_KEY_ALIAS`
- `LANDCHECK_UPLOAD_KEY_PASSWORD`

Recommended Android Studio flow:

1. Open `landcheck-mobile/android`.
2. Go to `Build` -> `Generate Signed Bundle / APK`.
3. Choose `APK`.
4. Click `Create new...` and create an upload keystore outside the repo.
   Suggested path:
   `C:\Users\User\keystores\lc-green-upload.jks`
5. Use a strong store password, key alias, and key password.
6. Click `OK`, then copy `landcheck-mobile/android/keystore.properties.example` to `landcheck-mobile/android/keystore.properties`.
7. Edit `landcheck-mobile/android/keystore.properties` and set:
   - `storeFile`
   - `storePassword`
   - `keyAlias`
   - `keyPassword`
8. Back in Android Studio, select the same keystore, alias, and passwords in the wizard.
9. Build the `release` variant.

Command-line alternative:

```bash
cd landcheck-mobile/android
gradlew.bat assembleRelease
```

Release APK output is typically:

- `landcheck-mobile/android/app/build/outputs/apk/release/app-release.apk`

For direct sharing outside Play Store:

1. Build the signed `release` APK.
2. Send `app-release.apk` to testers/users.
3. They install it with `Install unknown apps` enabled on Android.

Important:

- Keep the keystore and passwords safe.
- Future updates to the same public app must use the same keystore.
- Do not commit `keystore.properties` or the `.jks` file.
