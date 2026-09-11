import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

async function GET_impl() {
  await connectDB();
  const [counselors, sessions, completed, victims] = await Promise.all([
    CounselorProfile.countDocuments({ verificationStatus: "VERIFIED" }),
    SupportSession.countDocuments(),
    SupportSession.countDocuments({ status: "COMPLETED" }),
    User.countDocuments({ role: "VICTIM" }),
  ]);
  return NextResponse.json({ counselors, sessions, completed, victims });
}

export const GET = apiHandler(GET_impl);
