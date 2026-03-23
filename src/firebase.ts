import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigImport from '../firebase-applet-config.json';

// Use imported config or environment variables
const config = {
  apiKey: firebaseConfigImport.apiKey || process.env.VITE_FIREBASE_API_KEY,
  authDomain: firebaseConfigImport.authDomain || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: firebaseConfigImport.projectId || process.env.VITE_FIREBASE_PROJECT_ID,
  appId: firebaseConfigImport.appId || process.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: firebaseConfigImport.firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID
};

const app = initializeApp(config);
export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

// Persist login across browser sessions — user won't need to re-login
setPersistence(auth, browserLocalPersistence).catch(console.error);
