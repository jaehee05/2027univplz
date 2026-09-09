"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { firebaseClientConfig } from "@/lib/env";

const app = getApps().length ? getApp() : initializeApp(firebaseClientConfig);

export const clientAuth = getAuth(app);
export const clientDb = getFirestore(app);
export const clientStorage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
