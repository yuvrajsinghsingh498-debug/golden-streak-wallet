import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
};

/** True once the Firebase keys have been provided. */
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp() {
  if (!firebaseReady) throw new Error("Firebase is not configured yet. Add your Firebase keys to continue.");
  if (typeof window === "undefined") throw new Error("Firebase is only available in the browser.");
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    const a = ensureApp();
    try {
      dbInstance = initializeFirestore(a, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      dbInstance = getFirestore(a);
    }
  }
  return dbInstance;
}

/** Lazy instances: touching a property initializes Firebase in the browser. */
export const auth = new Proxy({} as Auth, { get: (_, p) => Reflect.get(getFirebaseAuth(), p) });
export const db = new Proxy({} as Firestore, { get: (_, p) => Reflect.get(getDb(), p) });

export const ADMIN_EMAIL = "yuvrajsinghsingh498@gmail.com";
