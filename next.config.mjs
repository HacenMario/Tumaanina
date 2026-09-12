/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // الخادم الموحّد server.js يشغّل Next مباشرة — لا حاجة لـ standalone
  // تثبيت جذر المشروع: يمنع Next من "استنتاج" جذر خاطئ وجود ملفات قفل أعلى الشجرة
  turbopack: { root: path.resolve(__dirname) },
  // mongoose خارج حزمة البناء: يشارك الخادم الموحّد نفس الاتصال عبر require() مباشرة
  serverExternalPackages: ["mongoose"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // v1.13.0 — تسريع: بلا ترويسة X-Powered-By + تحسين استيراد الحزم الثقيلة
  // (تحريك شجري أدق للأيقونات وحركات ورسوم البيانات => حزمة أصغر)
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
  // فصل الواجهة عن الخادم (مثلاً: واجهة على Vercel + خادم على Railway):
  // اضبط NEXT_PUBLIC_API_URL بعنوان الخادم، فتُمرَّر كل طلبات /api و/socket.io إليه
  // تلقائياً من جهة الخادم — بلا أي تعديل في المكونات وبلا مشاكل CORS.
  ...(process.env.NEXT_PUBLIC_API_URL
    ? {
        rewrites: async () => [
          {
            source: "/api/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")}/api/:path*`,
          },
          {
            source: "/socket.io/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")}/socket.io/:path*`,
          },
        ],
      }
    : {}),
};

export default nextConfig;
