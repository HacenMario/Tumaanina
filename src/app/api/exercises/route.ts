import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { CounselorProfile, Exercise, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 700_000; /* ~700KB لكل صورة مضغوطة في المتصفح */
const MAX_STEPS = 12;

/* ─── v2.14.0: تمارين التهدئة المضافة من المختصين والأدمين ───
   GET  → كل التمارين المخصصة (الأحدث أولاً) مع اسم منشئها
   POST { userId, title, description?, steps?, images?, durationMinutes? }
        → للمختصين الموثّقين والأدمين فقط */
async function GET_impl() {
  await connectDB();
  const rows = (await Exercise.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()) as unknown as {
    _id: unknown;
    title: string;
    description?: string;
    steps?: string[];
    images?: string[];
    durationMinutes?: number | null;
    createdBy?: unknown;
    createdByRole?: string;
    creatorName?: string | null;
    createdAt?: Date | string;
  }[];

  /* أسماء المنشئين: الأخصائي باسمه المهني (إن غاب الاسم المحفوظ) */
  const items = await Promise.all(
    rows.map(async (r) => {
      let creator = r.creatorName || null;
      if (!creator && r.createdByRole === "COUNSELOR") {
        const p = (await CounselorProfile.findOne({ userId: String(r.createdBy) })
          .select("fullName")
          .lean()) as { fullName?: string } | null;
        creator = p?.fullName || null;
      }
      return {
        id: String(r._id),
        title: r.title,
        description: r.description || "",
        steps: r.steps || [],
        images: r.images || [],
        durationMinutes: r.durationMinutes ?? null,
        createdByRole: r.createdByRole || "COUNSELOR",
        creatorName: creator,
        createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : null,
      };
    })
  );
  return NextResponse.json({ exercises: items });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  await connectDB();
  const u = (await User.findById(userId).select("role suspended").lean()) as
    | { role?: string; suspended?: boolean }
    | null;
  if (!u || u.suspended) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (u.role !== "COUNSELOR" && u.role !== "ADMIN") {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  const title = String(body.title || "").trim().slice(0, 160);
  const description = String(body.description || "").trim().slice(0, 1200);
  const steps = Array.isArray(body.steps)
    ? body.steps.map((s: unknown) => String(s || "").trim().slice(0, 400)).filter(Boolean).slice(0, MAX_STEPS)
    : [];
  const durationMinutes = Number.isFinite(Number(body.durationMinutes)) && Number(body.durationMinutes) > 0
    ? Math.min(180, Math.round(Number(body.durationMinutes)))
    : null;
  let images = Array.isArray(body.images) ? body.images.filter((x: unknown) => typeof x === "string") : [];
  if (images.length > MAX_IMAGES) images = images.slice(0, MAX_IMAGES);
  for (const img of images) {
    if ((img as string).length > MAX_IMAGE_B64) {
      return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 400 });
    }
  }

  if (!title || steps.length === 0) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  /* اسم المنشئ محفوظ مع التمرين (يرافق الحساب لو تغيّر لاحقاً) */
  let creatorName: string | null = null;
  if (u.role === "COUNSELOR") {
    const p = (await CounselorProfile.findOne({ userId }).select("fullName").lean()) as
      | { fullName?: string }
      | null;
    creatorName = p?.fullName || null;
  } else {
    creatorName = "Admin";
  }

  const created = await Exercise.create({
    title,
    description,
    steps,
    images,
    durationMinutes,
    createdBy: userId,
    createdByRole: u.role,
    creatorName,
  });

  return NextResponse.json({ ok: true, id: String(created._id) });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
