/**
 * CLOVA OCR 연동 확인. npm run check:clova [파일]
 * 실제로 네이버 클라우드에 요청하므로 요금이 든다.
 */
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");

async function main() {
  const file = process.argv[2] ?? "/tmp/dummy/scan.pdf";
  const url = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!url || !secret) throw new Error("CLOVA_OCR_INVOKE_URL · CLOVA_OCR_SECRET 이 없습니다.");

  // 내부 전용 주소면 여기서 걸러진다.
  const host = new URL(url).hostname;
  const { address } = await import("node:dns/promises").then((dns) => dns.lookup(host));
  const isPrivate = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
  console.log(`▶ ${host} → ${address}${isPrivate ? "  ✖ NCP 내부 전용 주소 (바깥에서 안 닿음)" : "  ✓ 공개 주소"}`);
  if (isPrivate) {
    console.log(
      "\n  NCP 콘솔 > CLOVA OCR > 도메인 > API Gateway 연동을 켜고,\n" +
        "  https://<id>.apigw.ntruss.com/custom/v1/... 형태의 Invoke URL 을 넣어 주세요.",
    );
    process.exit(1);
  }

  const data = readFileSync(file);
  console.log(`▶ ${file} (${Math.round(data.length / 1024)}KB)`);

  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret },
    body: JSON.stringify({
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      enableTableDetection: true,
      images: [{ format: "pdf", name: "check", data: data.toString("base64") }],
    }),
  });

  const text = await response.text();
  console.log(`  HTTP ${response.status} · ${Math.round((Date.now() - started) / 1000)}초`);
  if (!response.ok) {
    console.log(`  본문: ${text.slice(0, 600)}`);
    process.exit(1);
  }

  const result = JSON.parse(text);
  // 응답 모양을 눈으로 확인한다 — 문서와 다를 수 있다.
  console.log(`  최상위 키: ${Object.keys(result).join(", ")}`);
  const images = result.images ?? [];
  console.log(`  images ${images.length}개`);

  images.forEach((image: Record<string, unknown>, index: number) => {
    const fields = (image.fields ?? []) as { inferText?: string; lineBreak?: boolean }[];
    console.log(
      `\n  [${index + 1}] inferResult=${image.inferResult} · 키 ${Object.keys(image).join(",")} · fields ${fields.length}개`,
    );
    let line = "";
    const lines: string[] = [];
    for (const field of fields) {
      line += line ? ` ${field.inferText ?? ""}` : (field.inferText ?? "");
      if (field.lineBreak) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    const joined = lines.join("\n");
    console.log(`  글자 ${joined.length}자 · 줄 ${lines.length}개`);
    console.log(
      joined
        .split("\n")
        .slice(0, 12)
        .map((l) => `    ${l}`)
        .join("\n"),
    );
  });
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
