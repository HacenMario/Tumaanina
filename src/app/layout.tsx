import type { Metadata, Viewport } from "next";
import { Cairo, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { PALETTE_BOOT_SCRIPT } from "@/lib/themes";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "طمأنينة — استشارات نفسية احترافية عبر الإنترنت",
  description:
    "منصة تجمعك بأخصائيين نفسيين موثّقين في جلسات آمنة عبر محادثة نصية وصوتية ومرئية — أسعار واضحة بالدينار الجزائري، حجز فوري، وسرّية تامة. متاحة على هاتفك وحاسوبك بتسع لغات.",
  keywords: [
    "استشارة نفسية",
    "أخصائي نفسي",
    "علاج نفسي أونلاين",
    "الصحة النفسية",
    "psychological consultation online",
    "online therapy",
    "consultation psychologique en ligne",
  ],
  applicationName: "طمأنينة",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    /* v1.8.0: أيقونة iOS الرسمية 180×180 بخلفية صلبة — iOS لا يدعم الشفافية
       في أيقونات الشاشة الرئيسية (يعرضها سوداء)، لذا اشتُققت من الأيقونة القابلة للقناع */
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "طمأنينة — لا تحمل همّك وحدك",
    description:
      "استشارات نفسية احترافية آمنة عبر النص والصوت والفيديو مع أخصائيين موثّقين — احجز جلستك الأولى الآن.",
    type: "website",
    locale: "ar_DZ",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "طمأنينة",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7c3aed" },
    { media: "(prefers-color-scheme: dark)", color: "#231543" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /* v1.8.0: يلزم لعمل env(safe-area-inset-*) على الآيفون — النوتش ومؤشر
     الهوم في وضع التطبيق المثبّت لا يحجبان المحتوى بعد إضافة الهوامش الآمنة */
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* v2.14.0: تطبيق الثيم المحفوظ قبل الإقلاع — لا وميض للوحة الافتراضية */}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }} />
      </head>
      <body className={`${cairo.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
