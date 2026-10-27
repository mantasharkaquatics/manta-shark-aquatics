# The Manta Shark phone app

Owner, 2026-10-27. A native shell (Capacitor 8) that opens the website, plus
what a website cannot do: push notifications (Firebase Cloud Messaging) and,
later, the camera. Parents only; staff keep using the website.

The site itself is the app's content (`server.url` in `capacitor.config.json`),
so nothing in here is built from the Next.js code. A change to the website
reaches the app with the next deploy, with no store review. Only a change in
this folder (a plugin, a permission, the icon) needs a new app version.

The site side lives in the main repo: `components/AppBridge.tsx`,
`lib/native-app.ts`, `lib/push.ts`, `lib/push-text.ts` (see AGENTS.md, "Push
notifications to the phone app").

## Store listings (replace the old Wix apps)

- Google Play: `branded.com.mantasharkaquaticss` (two s) is the live listing;
  `appId` here matches it. `branded.com.mantasharkaquatics` is suspended and
  unused.
- App Store: the existing "Manta Shark Aquatics" app (Apple ID 6743440484),
  bundle ID `branded.com.mantasharkaquatics` -- ONE s, unlike Android. It is
  set in the Xcode project (capacitor.config.json's appId is Android's);
  `npx cap sync` does not overwrite it.
- Home-screen name: "Manta Shark". Store name stays "Manta Shark Aquatics".
- Versions must be higher than the Wix builds: the App Store has 2.122618.631
  (use 3.0 or above); Android's versionCode must exceed the live one (read it
  in Play Console -> App bundle explorer before the first upload).

## Not in git (each machine adds them)

- `android/app/google-services.json` and `ios/App/App/GoogleService-Info.plist`
  from the Firebase console (Project settings -> Your apps).
- `node_modules/` -- `npm install` in this folder.

## Working on it

```
cd mobile
npm install
npx cap sync          # after any change in this folder
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

iOS, once in Xcode: Signing & Capabilities -> add "Push Notifications" and
"Background Modes" (Remote notifications). Firebase needs the Apple push key
(.p8) uploaded under Project settings -> Cloud Messaging.

The server sends nothing until `FCM_SERVICE_ACCOUNT` (the Firebase service
account key, JSON) is set on Vercel.

## While testing

`server.url` is the live site. Preview links sit behind Vercel's login, which
the app cannot pass. Test with the test families only. At launch the site
moves to .com: change `server.url` to the .com address (both domains are
already in `allowNavigation`).
