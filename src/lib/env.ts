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
  /**
   * 첨삭에서 생각에 얼마나 힘을 쓸지. 출력 토큰이 여기서 크게 갈린다.
   * 비워 두면 모델이 알아서 정한다.
   */
  get correctionEffort(): "low" | "medium" | "high" | "xhigh" | "max" | undefined {
    const raw = process.env.ANTHROPIC_EFFORT_CORRECTION;
    return raw === "low" || raw === "medium" || raw === "high" || raw === "xhigh" || raw === "max"
      ? raw
      : undefined;
  },
  /** 올린 파일이 무엇인지 가려내는 작업 — 여러 개를 동시에 돌리므로 빠른 모델을 쓴다 */
  get classifyModel(): string {
    return process.env.ANTHROPIC_MODEL_CLASSIFY ?? "claude-haiku-4-5";
  },
  /**
   * 네이버 클라우드 CLOVA OCR — 한국어 스캔본 처리용. 없으면 Claude 로 넘어간다.
   * 값은 .env.local · Vercel 환경변수로만 넣는다.
   */
  get clovaOcrInvokeUrl(): string | null {
    return process.env.CLOVA_OCR_INVOKE_URL || null;
  },
  get clovaOcrSecret(): string | null {
    return process.env.CLOVA_OCR_SECRET || null;
  },
  /** Firebase 세션 쿠키 최대 수명은 14일. */
  get sessionCookieDays(): number {
    const raw = Number(process.env.SESSION_COOKIE_DAYS ?? 5);
    return Number.isFinite(raw) && raw > 0 && raw <= 14 ? raw : 5;
  },
};
