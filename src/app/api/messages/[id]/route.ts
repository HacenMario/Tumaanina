import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* جسر البث الفوري — نفس منهج /api/messages */
function bridgeEmit(room: string, event: string, payload: unknown) {
  try {
    const emit = (globalThis as { __tumaaninaEmit?: (r: string, e: string, p: unknown) => void }).__tumaaninaEmit;
    if (typeof emit === "function") emit(room, event, payload);
  } catch {
    /* الجسر اختياري */
  }
}

function roomOf(m: { sessionId?: unknown; threadKey?: string | null }): string | null {
  if (m.sessionId) return String(m.sessionId);
  if (m.threadKey) return m.threadKey;
  return null;
}

/**
 * v1.5.0 — تعديل رسالة (نص فقط) من صاحبها حصراً:
 * PATCH { userId, content } → editedAt يُضبط والبث الفوري يحدّث الطرف الآخر.
 * الرسائل القديمة بلا senderId (قبل v1.5.0) تبقى للقراءة فقط —
 * ولا يمكن لأي طرف تعديل رسالة ليست له.
 */
async function PATCH_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!userId || !content) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (content.length > 4000) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  await connectDB();
  const m = (await Message.findById(id).lean()) as
    | { _id: unknown; sessionId?: unknown; threadKey?: string | null; senderRole?: string; senderId?: string | null; deleted?: boolean }
    | null;
  if (!m) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (m.deleted) return NextResponse.json({ error: "DELETED" }, { status: 400 });
  /* المرسل وحده يعدّل — والنظام رسائل فقط (SYSTEM غير قابلة للتعديل) */
  if (m.senderRole === "SYSTEM") return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  if (!m.senderId || m.senderId !== userId) {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  const updated = (await Message.findByIdAndUpdate(
    id,
    { $set: { content: content.slice(0, 4000), editedAt: new Date() } },
    { new: true }
  ).lean()) as unknown as {
    _id: unknown; sessionId?: unknown; threadKey?: string | null; senderRole?: string; senderName?: string | null; senderId?: string | null; type?: string; content: string; editedAt?: Date | null; deleted?: boolean; createdAt?: Date;
  } | null;
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const payload = {
    id: String(updated._id),
    sessionId: updated.sessionId ? String(updated.sessionId) : null,
    threadKey: updated.threadKey || null,
    senderRole: updated.senderRole,
    senderName: updated.senderName,
    senderId: updated.senderId || null,
    type: updated.type || "text",
    content: updated.content,
    editedAt: updated.editedAt || null,
    deleted: !!updated.deleted,
    createdAt: updated.createdAt,
  };
  const room = roomOf(updated);
  if (room) bridgeEmit(room, m.threadKey ? "dm_message" : "text_message", payload);

  return NextResponse.json({ ok: true, message: payload });
}

/**
 * v1.5.0 — حذف رسالة من صاحبها حصراً (حذف ناعم): تُعرض لدى الطرفين
 * كرسالة محذوفة بدل أن تختفي فجأة، ويُبث التحديث فوراً.
 */
async function DELETE_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  await connectDB();
  const m = (await Message.findById(id).lean()) as
    | { _id: unknown; sessionId?: unknown; threadKey?: string | null; senderRole?: string; senderId?: string | null }
    | null;
  if (!m) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (m.senderRole === "SYSTEM") return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  if (!m.senderId || m.senderId !== userId) {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  const updated = (await Message.findByIdAndUpdate(
    id,
    { $set: { deleted: true, content: "" } },
    { new: true }
  ).lean()) as unknown as {
    _id: unknown; sessionId?: unknown; threadKey?: string | null; senderRole?: string; senderName?: string | null; senderId?: string | null; type?: string; content: string; editedAt?: Date | null; deleted?: boolean; createdAt?: Date;
  } | null;
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const payload = {
    id: String(updated._id),
    sessionId: updated.sessionId ? String(updated.sessionId) : null,
    threadKey: updated.threadKey || null,
    senderRole: updated.senderRole,
    senderName: updated.senderName,
    senderId: updated.senderId || null,
    type: updated.type || "text",
    content: "",
    editedAt: updated.editedAt || null,
    deleted: true,
    createdAt: updated.createdAt,
  };
  const room = roomOf(updated);
  if (room) bridgeEmit(room, m.threadKey ? "dm_message" : "text_message", payload);

  return NextResponse.json({ ok: true, message: payload });
}

export const PATCH = apiHandler(PATCH_impl);
export const DELETE = apiHandler(DELETE_impl);
