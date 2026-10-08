# TaxMate mobile app (Android and iOS)

The mobile app is the same React SPA wrapped in Capacitor 8. App id
`com.ascratech.taxmate`, app name `TaxMate`. The native projects live in
`frontend/android/` and `frontend/ios/`. The web build is not affected: every
mobile code path only runs in the mobile build.

## Prerequisites

- Node 22 or newer (Capacitor 8 CLI needs it)
- For Android: JDK 21 and Android Studio (SDK platform 36)
- For iOS: a Mac with Xcode 16 or newer. iOS uses Swift Package Manager, so
  CocoaPods is not needed.

## Build and run

From `frontend/`:

```bash
npm ci                    # first time, or after package changes
npm run build:mobile      # builds the app bundle into dist-mobile/
npx cap sync              # copies dist-mobile/ and plugins into android/ and ios/
                          # (or: npx cap sync android / npx cap sync ios)
```

`npm run cap:sync` does both steps in one go. Run it again after every change
to the React code; the native projects only see what was last synced.

Open in the IDE:

```bash
npx cap open android      # Android Studio, then Run on an emulator or device
npx cap open ios          # Xcode, then pick a simulator or device and Run
```

Run directly on a connected device or emulator from the terminal:

```bash
npx cap run android
npx cap run ios
```

Android command-line build (debug APK at
`android/app/build/outputs/apk/debug/app-debug.apk`):

```bash
cd android && ./gradlew assembleDebug
```

To run on a real iPhone you need to pick your own team under Signing &
Capabilities in Xcode. Do not commit that change.

## How the app connects to a workspace

1. On first launch the app asks for the workspace address, for example
   `alnoor.taxmate.ae`. It always uses `https://`, and checks the address by
   calling `taxmate.api.mobile.app_config`.
2. The user signs in with a 6-digit code sent by email, or with their password
   ("Use password instead"). Password sign-in is refused if two-factor
   authentication is enforced for that user; they must use the email code.
3. The server returns a device token. The app stores it in the Keychain /
   Keystore and sends `Authorization: TaxMate <token>` on every request. No
   cookies are used. Tokens last 90 days and are extended on use.
4. The user sets a 6-digit PIN and can turn on Face ID / fingerprint. The app
   locks on cold start and after 5 minutes in the background.

### Required site config (once per site)

The app runs from its own origin (`https://localhost` on Android,
`capacitor://localhost` on iOS), so the site must allow those origins:

```bash
bench --site <site> set-config -p allow_cors '["https://localhost","capacitor://localhost"]'
```

If the site already has `allow_cors` set, merge these two values into the
existing list instead of replacing it. The site must also be reachable over
HTTPS with a valid certificate. For local testing against your own bench, put
it behind an HTTPS tunnel or a staging domain; plain `http://` will not work.

The sign-in code is sent by email, so the site needs a working outgoing email
account.

## Getting the APK from GitHub Actions

The `Mobile` workflow (`.github/workflows/mobile.yml`) runs on pushes to
`version-16` and `frontend` that touch `frontend/`, and can be started by hand
from the Actions tab (Run workflow).

1. Open the repository on GitHub, go to Actions, then the Mobile workflow.
2. Open the latest successful run.
3. Under Artifacts, download `taxmate-debug-apk` (a zip containing
   `app-debug.apk`). Artifacts are kept for 14 days.
4. Copy the APK to an Android phone and install it (allow installs from unknown
   sources), or run `adb install app-debug.apk`.

The same workflow builds the iOS app for the simulator, unsigned, to prove it
compiles. It does not produce an installable iOS build. Signed builds are not
set up yet.

## Testing in a desktop browser: `?mobile-test=1`

A mobile build can be run in a normal browser to check the mobile screens
without a phone:

```bash
npm run build:mobile
npx vite preview --mode mobile --outDir dist-mobile
```

Then open the preview URL with `?mobile-test=1` added. The flag is remembered
for the browser tab; `?mobile-test=0` turns it off. Plugins fall back to their
web versions (storage is not secure). Add `&bio=face` to fake an available
biometric prompt.

The flag only works in mobile builds. The normal web build ignores it. The
browser origin (for example `http://localhost:4173`) is not in the
`allow_cors` list above, so add it to a test site's `allow_cors` if you need to
call a real workspace from the preview. Never add it on production.

## Troubleshooting

**CORS errors in the console** (`No 'Access-Control-Allow-Origin' header`).
The site is missing the `allow_cors` config above, or the value is not a JSON
list. Check with `bench --site <site> show-config` and make sure you used
`-p`. Restart the bench after changing it if requests still fail.

**"We couldn't reach this address."** The app could not load
`https://<address>/api/method/taxmate.api.mobile.app_config`. Check:
the address is spelled right; the site is up and serves HTTPS with a valid
certificate (self-signed certificates are rejected); the device has a
connection; and CORS is configured (a CORS failure looks like an unreachable
address to the app). "This address isn't a TaxMate workspace" means the server
answered but TaxMate is not installed there.

**Signed in, then sent straight back to sign-in (401 loop).** Any 401 clears
the token and returns to sign-in. Common causes: the device was revoked or the
token expired; the user was disabled or their password was changed (this
revokes all their devices); the user no longer has a TaxMate role; or the
TaxMate app on the server is older than the app and does not have the mobile
auth hook. Check the TaxMate Mobile Device list in the desk for the user's
rows, and the server's error log.

**The sign-in code email never arrives.** The site has no working outgoing
email account. Set up a default outgoing Email Account on the site, then check
the Email Queue for errors. The app always says a code was sent, even for
unknown addresses (so it does not reveal who has an account), so a missing
email can also mean the address is not an enabled user with a TaxMate role.
Codes expire after 10 minutes, and 5 wrong attempts cancel the code. Repeated
requests are rate limited; wait an hour if you hit the limit.

**Changes to the React code don't show up in the app.** Run
`npm run build:mobile` and `npx cap sync` again, then rebuild in the IDE.

**Android build fails with a Java version error.** The project needs JDK 21.
In Android Studio set Settings > Build Tools > Gradle > Gradle JDK to 21.
