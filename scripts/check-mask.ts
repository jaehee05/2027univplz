/**
 * 가림칠이 제자리에 앉는지 잰다. npm run check:mask
 * 외부 호출이 없어 요금이 들지 않는다.
 *
 * 쪽에 회전(`/Rotate`)이 걸려 있으면 보이는 모양과 속 좌표계가 어긋난다.
 * 선생님은 보이는 그대로 칠하므로, 그 회전을 되돌려 자리를 잡아야 한다.
 * 여기서 네 방향을 모두 걸어 본다 — 이 계산이 틀리면 엉뚱한 곳이 덮여
 * 해설이 그대로 학생에게 나간다.
 */
import { PDFDocument, degrees, rgb } from "pdf-lib";

/** `lib/docs/crop.ts` 의 paintMask 와 같은 계산. 서버 의존성 없이 재려고 옮겨 적었다. */
function place(
  width: number,
  height: number,
  angle: number,
  mask: { x: number; y: number; w: number; h: number },
) {
  const turned = angle === 90 || angle === 270;
  const viewW = turned ? height : width;
  const viewH = turned ? width : height;

  const vx = mask.x * viewW;
  const vy = mask.y * viewH;
  const vw = mask.w * viewW;
  const vh = mask.h * viewH;

  switch (angle) {
    case 90:
      return { x: vy, y: vx, width: vh, height: vw };
    case 180:
      return { x: width - vx - vw, y: vy, width: vw, height: vh };
    case 270:
      return { x: width - vy - vh, y: height - vx - vw, width: vh, height: vw };
    default:
      return { x: vx, y: height - vy - vh, width: vw, height: vh };
  }
}

async function main() {
  const W = 600;
  const H = 800;

  let failed = 0;

  function check(name: string, got: number, want: number) {
    const ok = Math.abs(got - want) < 0.01;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "✔" : "✗"} ${name}: ${got.toFixed(1)} (기대 ${want.toFixed(1)})`);
  }

  /**
   * 보이는 화면의 **왼쪽 위 1/4** 을 칠했을 때, 회전마다 어느 자리가 덮여야 하는가.
   * 회전을 되돌리면 그 자리는 언제나 "원본에서 보이는 왼쪽 위"에 해당한다.
   */
  const quarter = { x: 0, y: 0, w: 0.5, h: 0.5 };

  console.log("쪽 크기 600 × 800 · 보이는 화면의 왼쪽 위 1/4 을 칠한다\n");

  // 회전 0 — 보이는 대로. PDF 는 아래가 원점이라 위쪽 절반은 y = 400 부터.
  console.log("회전 0도");
  {
    const r = place(W, H, 0, quarter);
    check("x", r.x, 0);
    check("y", r.y, 400);
    check("너비", r.width, 300);
    check("높이", r.height, 400);
  }

  // 회전 90도(시계) — 보이는 폭은 800, 높이는 600. 가로세로가 바뀐다.
  console.log("\n회전 90도 — 보이는 크기 800 × 600");
  {
    const r = place(W, H, 90, quarter);
    // 보이는 왼쪽 위는 속 좌표에서 왼쪽 아래다.
    check("x", r.x, 0);
    check("y", r.y, 0);
    check("너비", r.width, 300);
    check("높이", r.height, 400);
  }

  console.log("\n회전 180도");
  {
    const r = place(W, H, 180, quarter);
    // 뒤집혔으니 보이는 왼쪽 위는 속 좌표의 오른쪽 아래.
    check("x", r.x, 300);
    check("y", r.y, 0);
    check("너비", r.width, 300);
    check("높이", r.height, 400);
  }

  console.log("\n회전 270도 — 보이는 크기 800 × 600");
  {
    const r = place(W, H, 270, quarter);
    check("x", r.x, 300);
    check("y", r.y, 400);
    check("너비", r.width, 300);
    check("높이", r.height, 400);
  }

  // 칠한 자리가 언제나 쪽 안에 들어오는지 — 넘치면 pdf-lib 이 조용히 잘라 낸다.
  console.log("\n어느 회전이든 쪽 밖으로 나가지 않는가");
  for (const angle of [0, 90, 180, 270]) {
    for (const mask of [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.13, y: 0.77, w: 0.4, h: 0.2 },
    ]) {
      const r = place(W, H, angle, mask);
      const inside =
        r.x >= -0.01 && r.y >= -0.01 && r.x + r.width <= W + 0.01 && r.y + r.height <= H + 0.01;
      if (!inside) {
        failed += 1;
        console.log(`  ✗ ${angle}도 ${JSON.stringify(mask)} → ${JSON.stringify(r)}`);
      }
    }
  }
  console.log("  ✔ 모두 쪽 안");

  // 실제로 pdf-lib 이 받아 주는지도 한 번 굽는다.
  console.log("\n실제로 구워지는가");
  const doc = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const page = doc.addPage([W, H]);
    page.setRotation(degrees(angle));
    const r = place(W, H, angle, quarter);
    page.drawRectangle({ ...r, color: rgb(1, 1, 1), borderWidth: 0 });
  }
  const bytes = await doc.save();
  console.log(`  ✔ ${doc.getPageCount()}쪽 · ${bytes.length.toLocaleString()}바이트`);

  if (failed > 0) {
    console.log(`\n✗ ${failed}개 어긋남`);
    process.exit(1);
  }
  console.log("\n✔ 가림칠 자리 계산 이상 없음");

}

main();
