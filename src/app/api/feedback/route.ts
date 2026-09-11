import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Feedback } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * اقتراحات التطوير وبلاغات المشاكل (عامة — بلا تسجيل):
 * POST {type: "suggestion"|"bug"|"other"|"contact", subject, message, contact?}
 */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const message = String(body.message || "").trim();
  if (message.length < 3) {
    return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  }

  const type = ["suggestion", "bug", "other", "contact"].includes(body.type) ? body.type : "other";

  await connectDB();
  await Feedback.create({
    type,
    subject: String(body.subject || "").slice(0, 200),
    message: message.slice(0, 4000),
    contact: body.contact ? String(body.contact).slice(0, 200) : null,
  });

  return NextResponse.json({ ok: true });
}

export const POST = apiHandler(POST_impl);
