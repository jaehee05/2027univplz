/**
 * 환경변수 접근 지점. 값은 여기서만 읽고, 없으면 즉시 알아볼 수 있게 던진다.
 * 하드코딩 금지 — .env.local / Vercel 환경변수로만 주입한다.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인하세요.`,
    );
  }
  return value;
}

/** 클라이언트 SDK 설정 — NEXT_PUBLIC_ 이므로 번들에 포함된다(공개 가능한 값). */
export const firebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** 서버 전용 값. 클라이언트 컴포넌트에서 부르면 안 된다. */
export const serverEnv = {
  get firebaseServiceAccount(): string {
    return required("FIREBASE_SERVICE_ACCOUNT_KEY", process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  },
  get anthropicApiKey(): string {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  /** 첨삭 · 채점 기준 분석 — 판단 품질이 결과를 좌우하는 작업 */
  get correctionModel(): string {
    return process.env.ANTHROPIC_MODEL_CORRECTION ?? "claude-opus-5";
  },
  /** PDF 텍스트화 등 단순 추출 작업 */
  get extractionModel(): string {
    return process.env.ANTHROPIC_MODEL_EXTRACTION ?? "claude-haiku-4-5";
  },
  /** Firebase 세션 쿠키 최대 수명은 14일. */
  get sessionCookieDays(): number {
    const raw = Number(process.env.SESSION_COOKIE_DAYS ?? 5);
    return Number.isFinite(raw) && raw > 0 && raw <= 14 ? raw : 5;
  },
};
