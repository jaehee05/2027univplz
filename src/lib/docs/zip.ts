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

function isDocument(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".hwpx");
}

/** zip 을 브라우저에서 풀어 기출 파일만 꺼낸다. 서버로는 그 파일들만 올라간다. */
export async function unzipDocuments(file: File): Promise<UnzippedFile[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (error, result) => (error ? reject(error) : resolve(result)));
  });

  const found = Object.entries(entries)
    .filter(([path]) => !isJunk(path) && isDocument(path))
    .map(([path, data]) => ({ name: path.split("/").pop() ?? path, data }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

  if (found.length === 0) {
    throw new Error(`${file.name} 안에 PDF·HWPX 파일이 없습니다.`);
  }
  return found;
}

/** 압축 파일인지 확장자·MIME 으로 판단한다. */
export function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}
