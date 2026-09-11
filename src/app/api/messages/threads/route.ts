import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v2.9.0 — صندوق المحادثات (خيوط DM) لمستخدم معيّن.
 * GET /api/messages/threads?userId={id}
 * يجمع كل خيوط dm:* التي يشارك فيها المستخدم ويعيد لكل خيط:
 * الطرف الآخر (معرّفه واسمه) + وقت آخر نشاط.
 * v1.7.0 — طلب المستخدم: لا يُعاد محتوى آخر رسالة إطلاقاً (كان يظهر
 * كنص طويل مشوّش للهاتف عندما تكون آخر رسالة صوتية data URI،
 * وكان الاستقصاء كل 10 ثوانٍ يجرّ حتى 1.3MB من الصوت بلا داعٍ).
 * البطاقة تعرض الاسم والوقت فقط، والضغط يفتح نافذة الدردشة كاملة.
 * تعتمد عليه لوحة الأخصائي لرؤية محادثات العميلين والرد عليها بلا جلسة.
 */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();
  const rows = (await Message.aggregate([
    { $match: { threadKey: { $regex: "^dm:" } } },
    { $sort: { createdAt: -1 } },
    /* v1.7.0: إسقاط خفيف — لا محتوى ولا بيانات ثقيلة (كان $$ROOT يجّر الصوت base64 كاملاً) */
    { $project: { threadKey: 1, senderName: 1, senderRole: 1, createdAt: 1 } },
    { $group: { _id: "$threadKey", doc: { $first: "$$ROOT" } } },
    { $sort: { "doc.createdAt": -1 } },
    { $limit: 80 },
  ]).allowDiskUse(true)) as {
    _id: string;
    doc: { senderName?: string; senderRole?: string; createdAt: Date };
  }[];

  const threads: {
    peerId: string;
    peerName: string | null;
    lastAt: string;
    lastSenderRole: string | null;
    mine: boolean;
  }[] = [];

  for (const row of rows) {
    const key = String(row._id || "");
    const parts = key.split(":");
    if (parts.length !== 3) continue;
    const [, a, b] = parts;
    if (a !== userId && b !== userId) continue;
    const peerId = a === userId ? b : a;
    const peer = (await User.findById(peerId).select("pseudonym").lean()) as { pseudonym?: string } | null;
    const myMsg =
      (row.doc.senderRole === "VICTIM" && a === userId) || (row.doc.senderRole === "COUNSELOR" && b === userId);
    threads.push({
      peerId,
      peerName: peer?.pseudonym || row.doc.senderName || null,
      lastAt: new Date(row.doc.createdAt).toISOString(),
      lastSenderRole: row.doc.senderRole ?? null,
      mine: myMsg,
    });
  }

  return NextResponse.json({ threads });
}

export const GET = apiHandler(GET_impl);
