"use client";

/**
 * v1.6.0 — ضغطة مستمرة 3 ثوانٍ على الرسالة → قائمة الأزرار المناسبة
 * (تعديل / حذف — طلب المستخدم الصريح).
 * ─────────────────────────────────────────────────────────────
 * تعمل باللمس والفأرة معاً:
 *  • الهاتف: ضغط مطوّل على الفقاعة 3 ثوانٍ (مع اهتزاز تأكيدي خفيف)
 *  • الحاسوب: ضغط زر الفأرة الأيسر مطوّلاً 3 ثوانٍ
 * تسحب الفقاعة أثناء التمرير يُلغي المؤقّت فلا تفتح القائمة صدفة.
 */
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";

const LONG_PRESS_MS = 3000; /* ثلاث ثوانٍ كما طلب المستخدم */
const MOVE_TOLERANCE = 14; /* سحب أكبر من هذا = تمرير صفحة لا ضغطة */

export function useLongPress(onFire: ((x: number, y: number) => void) | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPt = useRef({ x: 0, y: 0 });
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onFire || e.button === 2) return;
      startPt.current = { x: e.clientX, y: e.clientY };
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        try {
          navigator.vibrate?.(80);
        } catch {
          /* لا اهتزاز على هذا الجهاز */
        }
        onFire(startPt.current.x, startPt.current.y);
      }, LONG_PRESS_MS);
    },
    [onFire, clear]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!timer.current) return;
      const dx = Math.abs(e.clientX - startPt.current.x);
      const dy = Math.abs(e.clientY - startPt.current.y);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clear();
    },
    [clear]
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
    /* صار الضغطة الطويلة صارت قائمة؟ (لمنع فتح نافذة أخرى بالضغطة نفسها) */
    justFired: () => fired.current,
  };
}

/** قائمة أزرار الرسالة — تُعرض في Portal على body كي لا تقصّها حدود
 *  نوافذ الدردشة (overflow-hidden + transform في Radix يكسران fixed) */
export function MessageActionMenu({
  x,
  y,
  canEdit,
  onEdit,
  onDelete,
  labels,
  onClose,
}: {
  x: number;
  y: number;
  canEdit: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  labels: { edit: string; delete: string };
  onClose: () => void;
}) {
  /* إبقاء القائمة داخل نافذة العرض */
  const W = 150;
  const H = canEdit ? 96 : 52;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const left = Math.min(Math.max(8, x - W / 2), vw - W - 8);
  const top = Math.min(Math.max(8, y - H / 2), vh - H - 8);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* خلفية شفافة تلتقط أي ضغط خارج القائمة */}
      <div className="fixed inset-0 z-[70]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[71] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-pop"
        style={{ left, top, minWidth: W }}
        role="menu"
      >
        {canEdit && (
          <button
            type="button"
            className="w-full px-4 py-2.5 text-start text-xs font-bold flex items-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
            onClick={() => {
              onClose();
              onEdit?.();
            }}
            role="menuitem"
          >
            <Pencil className="h-3.5 w-3.5" />
            {labels.edit}
          </button>
        )}
        <button
          type="button"
          className="w-full px-4 py-2.5 text-start text-xs font-bold flex items-center gap-2 hover:bg-destructive/10 text-destructive transition-colors"
          onClick={() => {
            onClose();
            onDelete();
          }}
          role="menuitem"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {labels.delete}
        </button>
      </div>
    </>,
    document.body
  );
}
