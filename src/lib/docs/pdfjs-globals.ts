/**
 * pdfjs 를 부르기 전에 브라우저 전역을 흉내 낸다.
 *
 * pdfjs 는 Node 에서 돌 때 스스로 이것들을 채워 넣는데, 그 판단이
 * `process + "" === "[object process]"` 다. Vercel 에서는 번들러가 끼워 넣은 process 때문에
 * 이 검사가 어긋나 폴리필이 건너뛰어지고 `DOMMatrix is not defined` 로 모듈 적재가 실패한다.
 * (그러면 텍스트 PDF 까지 전부 스캔본 취급이 되어 OCR 로 넘어간다.)
 *
 * 우리는 글자만 뽑고 그림은 그리지 않으므로, 형태만 있는 빈 클래스로 충분하다.
 */

type Global = Record<string, unknown>;

class Stub {
  // 하위 클래스로 쓰이거나 new 로 만들어져도 터지지 않을 만큼만 있으면 된다.
  constructor(..._args: unknown[]) {}
}

/** DOMMatrix 는 곱셈 결과를 읽는 코드가 있어 항등행렬 값을 갖고 있게 한다. */
class DOMMatrixStub extends Stub {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
}

export function installPdfjsGlobals(): void {
  const globals = globalThis as unknown as Global;

  globals.DOMMatrix ??= DOMMatrixStub;
  globals.Path2D ??= Stub;
  globals.ImageData ??= Stub;
  globals.OffscreenCanvas ??= Stub;

  if (!(globals.navigator as { language?: string } | undefined)?.language) {
    globals.navigator = { language: "ko-KR", platform: "", userAgent: "" };
  }
}
