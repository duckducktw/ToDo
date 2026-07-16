import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "流動待辦",
    short_name: "流動待辦",
    description: "結合待辦安排與 Google 日曆參考的個人生產力工具",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f6f7",
    theme_color: "#00b4d8",
    lang: "zh-Hant",
    orientation: "any",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
