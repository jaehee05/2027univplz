"use client";

import { unzip } from "fflate";

export interface UnzippedFile {
  name: string;
  data: Uint8Array;
}

/** 맥에서 만든 zip 에 딸려 오는 부스러기와 폴더 항목은 건너뛴다. */
function isJunk(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith("/") ||
    base.startsWith("._") ||
    base === ".DS_Store" ||
    base === ""
  );
}

/** zip 을 브라우저에서 풀어 PDF 만 꺼낸다. 서버로는 PDF 만 올라간다. */
export async function unzipPdfs(file: File): Promise<UnzippedFile[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (error, result) => (error ? reject(error) : resolve(result)));
  });

  const pdfs = Object.entries(entries)
    .filter(([path]) => !isJunk(path) && path.toLowerCase().endsWith(".pdf"))
    .map(([path, data]) => ({ name: path.split("/").pop() ?? path, data }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

  if (pdfs.length === 0) {
    throw new Error(`${file.name} 안에 PDF 가 없습니다.`);
  }
  return pdfs;
}

/** 압축 파일인지 확장자·MIME 으로 판단한다. */
export function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}
