/**
 * pdfjs 워커를 public/ 으로 옮겨 둔다. dev · build 앞에서 저절로 돈다.
 *
 * 왜 번들러에 맡기지 않는가 — next.config.ts 가 `serverExternalPackages: ["pdfjs-dist"]`
 * 로 pdfjs 를 서버 번들 밖에 두는데(서버에서 워커 로딩이 깨지기 때문), 그 설정이
 * 브라우저에서 쓰는 워커 주소까지 같이 밀어내 버린다. 그래서 워커만 따로 내보내고
 * 화면에서는 `/pdf.worker.min.mjs` 로 부른다.
 *
 * public/pdf.worker.min.mjs 는 이 스크립트가 만드는 파일이라 git 에 넣지 않는다.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const source = join(
  dirname(require.resolve("pdfjs-dist/package.json")),
  "build",
  "pdf.worker.min.mjs",
);
const target = join(process.cwd(), "public", "pdf.worker.min.mjs");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`pdfjs 워커 준비됨 → public/pdf.worker.min.mjs`);
