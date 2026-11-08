import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/tuzhong-wenshu',
  // trailingSlash 保持 false：项目路由均按无斜杠设计；basePath 后带斜杠的情况在 middleware 单独处理
  // trailingSlash: true,
  // 🔥 开发时支持自定义 distDir（例如原 .next 被宿主进程锁定无法写入时换目录启动）
  distDir: process.env.NEXT_DEV_DIST_DIR || '.next',
  typescript: {
    ignoreBuildErrors: true,
  },
  devIndicators: false,
  compress: true,
  // 允许本机 headless 真渲验证（puppeteer 连 127.0.0.1）建立 HMR，避免跨源阻断导致客户端不水合
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
