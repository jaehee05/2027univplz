/**
 * PDF 원본 바이트에서 쪽 수를 세어 본다.
 *
 * CLOVA 가 뒷부분을 잘라 보내도 알아챌 수 있게 하려는 것이다.
 * pdfjs 를 띄우지 않고 대충 세는 것이라, 확실하지 않으면 0 을 돌려준다(검사 건너뜀).
 * 압축된 객체 스트림 안에 페이지 트리가 들어 있는 PDF 에서는 0 이 나온다.
 */

const DECODER = new TextDecoder("latin1");

export function countPdfPages(data: Uint8Array): number {
  // 앞뒤로 훑으면 되지만 크지 않은 파일이라 통째로 본다.
  const raw = DECODER.decode(data);

  // 1) 페이지 트리 루트의 /Count. 여러 개면 가장 큰 값이 전체 쪽 수다.
  let byCount = 0;
  for (const match of raw.matchAll(/\/Count\s+(\d+)/g)) {
    byCount = Math.max(byCount, Number(match[1]));
  }

  // 2) /Type /Page 개수. /Pages 는 세지 않는다.
  let byType = 0;
  for (const _ of raw.matchAll(/\/Type\s*\/Page(?![s])/g)) byType += 1;

  // 둘이 맞으면 믿는다. 어긋나면 판단하지 않는다.
  if (byCount > 0 && byType > 0) return byCount === byType ? byCount : 0;
  return byCount || byType || 0;
}
