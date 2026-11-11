# Daymark Cloud

A phone-friendly time-blocking calendar with 5-minute adjustments, 24-hour Day/Week views, Month view, tracked versus planned time, and team comparisons. The included Firebase integration adds individual accounts and shared team calendars.

## 1. Prepare your GitHub repository

1. Sign in to GitHub and open https://github.com/new.
2. **Owner**: your GitHub account. **Repository name**: `daymark-cloud`.
3. Choose **Public** if you have GitHub Free and want GitHub Pages. Do **not** add passwords, service-account JSON or private keys to this repository.
4. Create the repository. Upload the contents of this folder to the repository root, with `index.html` at the root. Keep `icons/` as a folder. **Do not upload the ZIP itself**.
5. Go to repository **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch **main**, folder **/(root)**, then Save.
6. The website address should be `https://YOUR_USERNAME.github.io/daymark-cloud/`. GitHub Pages can take several minutes to activate. Do not assume it is live until you open it successfully.

## 2. Create your Firebase project

1. Open https://console.firebase.google.com/ and create a project named **Daymark Cloud** (any available Firebase project ID is fine).
2. In **Project Overview → Add app → Web (`</>`)**, register a web app. Copy the *firebaseConfig* details shown by Firebase.
3. Open **Authentication → Sign-in method**. Enable **Email/Password**. Optionally enable **Google** sign-in.
4. In **Authentication → Settings → Authorized domains**, add `YOUR_USERNAME.github.io` (just the domain, without `https://` or `/daymark-cloud`). Firebase default auth domains are usually present.
5. Open **Firestore Database → Create database** and choose **Production mode**, not Test mode. Pick a region appropriate for your team (this choice is hard to change later).
6. In **Firestore Database → Rules**, replace the starter rules with the complete contents of `firestore.rules` in this folder, and click **Publish**. This is important: the rules keep team data behind authentication and ensure a member can only change their own tasks.

## 3. Connect the app

The Firebase web app configuration is pre-filled in `firebase-config.js` from the project screenshot. To change projects, edit that file using the values from **Firebase Console → Project settings → Your apps → SDK setup and configuration**:

```js
window.DAYMARK_FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID'
};
```

Only use the *web app configuration*, **never** a service-account key. The web config values are public identifiers; Firestore Security Rules are what protect your information.

Commit the updated `firebase-config.js` file on GitHub. The Pages website will refresh after deployment. Without this configuration, Daymark intentionally runs in local-demo mode and cannot synchronise between devices.

## 4. First-use check

1. Open the live website and create a Daymark account (or use Google sign-in, if enabled).
2. Create a team workspace; create a task and drag it onto the calendar.
3. Choose **Invite** and enter your colleague's email. Copy the invitation link and send it to that email.
4. On a second phone or computer, the colleague opens that link and signs in with the invited, verified email address.
5. Check that both accounts can see the team comparison. Try adding a task from the second device. Only each person can change their own calendar.
6. If you have tasks in Daymark 2.1, first use **Download a backup (JSON)** in that old version. Then use **Import MY tasks from a local backup (JSON)** in the cloud version after signing in. Each person imports their own old calendar.

## 5. Install on a phone

- **iPhone**: open the live HTTPS URL in Safari → **Share** → **Add to Home Screen**.
- **Android**: open the live HTTPS URL in Chrome → menu → **Install app** or **Add to Home screen**.

The app shell can load offline after installation, but collaborating and saving Firestore updates requires internet access. Data is not guaranteed to sync if you are offline.

## Costs, privacy and maintenance

- GitHub Pages can host the static site on an eligible free account using a public repository. Static files and source code in a public repository can be viewed by anyone; do not commit personal data or secrets.
- Firebase has usage quotas and possible charges depending on services and traffic. Check the current pricing and set budget alerts if you enable billing.
- Anyone you invite to a workspace can view the other team members' calendars and time comparisons, but access and writes are subject to the supplied Firestore Security Rules.
- Firebase signup is enabled for anyone who visits the website; they can create a **separate** workspace. They cannot see your workspace unless invited. For a tightly controlled internal deployment, add further registration restrictions.
- Keep JSON backups of important team records. The app is an early-stage prototype and is not yet an audited production business system.

## Troubleshooting

- **Still local-demo mode?** Check the four required values in `firebase-config.js`, verify the Pages site shows the latest version, and force refresh if the service worker has an old cached app.
- **`auth/unauthorized-domain`?** Add the exact published domain to **Firebase Authentication → Settings → Authorized domains**.
- **Permission denied?** Verify the Firestore rules were published and the team invite matches the signed-in account's verified email.
- **Doesn't load after enabling Firebase?** Check the web SDK configuration and open the browser's developer console for errors.
- **User cannot join?** They must open the invite link and sign in with the exact email address you invited.

This app's hosting is separate from its database. Publishing `index.html` alone makes the *interface* live, but Firebase setup is necessary for *real-time multi-user collaboration*.
