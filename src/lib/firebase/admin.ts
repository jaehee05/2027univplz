import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { firebaseClientConfig, serverEnv } from "@/lib/env";

let cached: App | null = null;

/**
 * 지연 초기화. 모듈을 불러오는 것만으로 서비스 계정을 요구하면
 * 빌드 단계에서 터지므로, 실제로 쓰는 시점에 초기화한다.
 */
function adminApp(): App {
  if (cached) return cached;

  const existing = getApps();
  if (existing.length) {
    cached = existing[0];
    return cached;
  }

  const raw = serverEnv.firebaseServiceAccount;
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY 를 JSON 으로 읽지 못했습니다. 서비스 계정 JSON 전체를 한 줄 문자열로 넣어 주세요.",
    );
  }

  cached = initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // Vercel 환경변수에 넣으면 줄바꿈이 \n 문자열로 들어온다.
      privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
    }),
    storageBucket: firebaseClientConfig.storageBucket,
  });
  return cached;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

let db: Firestore | null = null;

export function adminDb(): Firestore {
  if (db) return db;
  const app = adminApp();
  try {
    // 서버리스에서는 gRPC 연결을 새로 여는 비용이 커서 REST 로 붙는다.
    db = initializeFirestore(app, { preferRest: true });
  } catch {
    // 개발 중 핫 리로드로 이미 초기화된 경우
    db = getFirestore(app);
  }
  return db;
}

export function adminBucket() {
  return getStorage(adminApp()).bucket();
}
