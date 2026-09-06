import type { Metadata } from "next";
import "./globals.css";
import AuthCookieBridge from "@/components/AuthCookieBridge";

export const metadata: Metadata = {
  title: "途中文枢 - AI小说写作助手",
  description: "你的风格，AI实现。专为网文作者打造的AI写作助手，深度去AI化、风格克隆、长篇一致性守护。",
  icons: {
    icon: '/tuzhong-wenshu/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="h-full antialiased" suppressHydrationWarning>
        <AuthCookieBridge />
        {children}
      </body>
    </html>
  );
}
