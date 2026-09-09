import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs 는 번들러가 건드리면 워커 로딩이 깨진다. 서버에서 그대로 require 하게 둔다.
  serverExternalPackages: ["pdfjs-dist"],
  // prompts/*.md 는 코드에서 import 하지 않고 런타임에 읽으므로
  // 서버리스 번들에 직접 포함시켜 준다.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
};

export default nextConfig;
