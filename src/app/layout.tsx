import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/app/providers";
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLORS } from "@/lib/theme";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "流動待辦",
    template: "%s | 流動待辦",
  },
  description: "結合待辦安排與 Google 日曆參考的個人生產力工具",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={THEME_COLORS.light} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
