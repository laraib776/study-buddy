# StudyBuddy Setup Checklist

Use this file to finish the real login, database, and security setup for `studybuddy_v3.html`.

## 1. Create A Firebase Project

1. Go to <https://console.firebase.google.com/>.
2. Click **Add project**.
3. Name it something like `studybuddy`.
4. Disable Google Analytics if you do not need it.
5. Finish project creation.

## 2. Add A Web App

1. Inside your Firebase project, click the web icon: `</>`.
2. Register the app as `StudyBuddy Web`.
3. Firebase will show a config object like this:

npm install firebase

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBEatMy9zAA-12cFf1EutrJrIVpxpYVmA8",
  authDomain: "studybuddy-89f9b.firebaseapp.com",
  projectId: "studybuddy-89f9b",
  storageBucket: "studybuddy-89f9b.firebasestorage.app",
  messagingSenderId: "1040787079943",
  appId: "1:1040787079943:web:73a0a7c75bca9f9638bba2",
  measurementId: "G-YLGT1PKWCR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

npm install -g firebase-tools

firebase login
Initiate your project
Run this command from your app's root directory:

firebase init
When you're ready, deploy your web app
Put your static files (e.g. HTML, CSS, JS) in your app's deploy directory (the default is 'public'). Then, run this command from your app's root directory:

firebase deploy
<!-- main login : laraibkhalid@gmail.com and passw: lbk@123 -->


<!-- for ai the api is  this AIzaSyAKLgZyjG1bB7F_gqePXMJzahfmDc8uUEs -->

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

4. In `studybuddy_v3.html`, find this near the top:

```js
window.STUDYBUDDY_FIREBASE_CONFIG = null;
```

5. Replace it with:

```js
window.STUDYBUDDY_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Firebase web `apiKey` is public. Do **not** put MySQL passwords, Firebase Admin SDK private keys, service account JSON, or Anthropic/OpenAI server keys in this HTML file.

## 3. Enable Firebase Authentication

1. In Firebase Console, open **Build > Authentication**.
2. Click **Get started**.
3. Open **Sign-in method**.
4. Enable **Email/Password**.
5. Save.

The app currently requires email verification:

- Signup creates the account.
- Firebase sends a verification email.
- The user must click the email link.
- Only then can the user log in.

This is how the app blocks random fake email logins. A browser-only app cannot prove an email exists unless the user verifies the inbox.

## 4. Configure Firebase Email Verification

1. In Firebase Console, open **Authentication > Templates**.
2. Open **Email address verification**.
3. Customize the message if you want.
4. Make sure the sender/domain settings look correct.
5. Test with a real email account.

If verification emails go to spam, check the spam folder first.

## 5. Create Firestore Database

1. In Firebase Console, open **Build > Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode**.
4. Pick a nearby region.
5. Create.

The app stores user data in this collection:

```txt
studybuddyUsers/{firebaseUserId}
```

Each user document stores:

- notes
- topic
- flashcards
- quiz
- card ratings
- uploaded source labels
- calendar progress
- preferences
- theme
- custom icons
- decorations

## 6. Add Firestore Security Rules

In **Firestore Database > Rules**, use:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /studybuddyUsers/{userId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && request.auth.token.email_verified == true;
    }
  }
}
```

Publish the rules.

These rules mean:

- Users must be logged in.
- Users must have verified email.
- Users can only read/write their own document.
- User 1 cannot see User 2 data.

## 7. Add Authorized Domains

In Firebase Console:

1. Go to **Authentication > Settings > Authorized domains**.
2. Make sure these are allowed while testing:

```txt
localhost
127.0.0.1
```

When you deploy the site, add your real domain too.

## 8. Run The App Locally

From this folder:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Then open:

```txt
http://127.0.0.1:5500/studybuddy_v3.html
```

Avoid testing Firebase Auth from `file://` because auth redirects and verification can behave strangely.

## 9. Test The Full Login Flow

1. Open the app.
2. Click **Sign Up**.
3. Use a real email address.
4. Submit.
5. Check your inbox.
6. Click the Firebase verification link.
7. Return to the app.
8. Click **Login**.
9. Use the same email/password.
10. Confirm the app opens only after verification.

Also test:

- Wrong password should fail.
- Unverified email should fail.
- Refreshing should keep the verified user logged in.
- Logout should return to the login screen.

## 10. Optional SQL Backend Setup

The file `studybuddy_schema.sql` contains a SQL schema for a future backend.

Important: the browser must **not** connect directly to MySQL/SQL. If you want SQL, create a backend API.

Recommended backend flow:

```txt
Frontend
  -> Firebase login
  -> Gets Firebase ID token
  -> Sends token to backend API
Backend API
  -> Verifies token with Firebase Admin SDK
  -> Reads/writes MySQL using private DB credentials
MySQL
  -> Stores users, notes, calendar notes, preferences, progress
```

Backend tables already planned in `studybuddy_schema.sql`:

- `users`
- `user_preferences`
- `study_notes`
- `calendar_notes`
- `study_progress`
- `study_sets`

## 11. Security Rules To Remember

Never put these in frontend HTML:

- MySQL username/password
- Firebase service account JSON
- Private API keys
- Admin SDK credentials
- Server secrets

Safe to put in frontend:

- Firebase web config
- Public image paths
- Public CSS/JS references

For AI keys, the secure production setup is:

```txt
Frontend -> your backend API -> AI provider
```

That way users cannot inspect the page and steal the key.

## 12. Current App Features That Depend On Setup

Works after Firebase config:

- Real signup
- Email verification
- Verified login
- Logout
- Per-user cloud saving
- Per-user notes
- Per-user calendar notes
- Per-user theme/icons/decorations

Works without Firebase config:

- The page loads
- UI can be viewed
- Login will block real entry because Firebase is required

