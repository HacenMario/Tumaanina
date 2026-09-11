"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getQuickHideConfig, hashPin, isHidden, setHidden, QUICK_HIDE_TRIGGER, QUICK_HIDE_CHANGE } from "@/lib/quick-hide";

/* ─── الإخفاء السريع: حاسبة حقيقية بالكامل ───
   شاشة تمويه محايدة تماماً: حاسبة عادية تعمل فعلاً بلا أي أثر
   للمنصة. العودة: أدخل الرمز السري (4–8 أرقام) ثم اضغط «=». */

interface CalcState {
  display: string;
  prev: number | null;
  op: string | null;
  waitingForOperand: boolean;
}

const initialState: CalcState = { display: "0", prev: null, op: null, waitingForOperand: false };

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case "÷": return b === 0 ? NaN : a / b;
    case "×": return a * b;
    case "−": return a - b;
    case "+": return a + b;
    default: return b;
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  /* تقريب لتجنب فوضى الفاصلة العائمة (0.1+0.2) */
  const rounded = Math.round(n * 1e10) / 1e10;
  const s = String(rounded);
  return s.length > 12 ? rounded.toExponential(6) : s;
}

export function QuickHideOverlay() {
  const [hidden, setHiddenState] = useState(false);
  const [calc, setCalc] = useState<CalcState>(initialState);
  const [shake, setShake] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    setHiddenState(isHidden());
    const onTrigger = () => {
      setCalc(initialState);
      setHiddenState(true);
    };
    const onChange = (e: Event) => setHiddenState(Boolean((e as CustomEvent).detail));
    window.addEventListener(QUICK_HIDE_TRIGGER, onTrigger);
    window.addEventListener(QUICK_HIDE_CHANGE, onChange);
    return () => {
      window.removeEventListener(QUICK_HIDE_TRIGGER, onTrigger);
      window.removeEventListener(QUICK_HIDE_CHANGE, onChange);
    };
  }, []);

  const inputDigit = useCallback((d: string) => {
    setShake(false);
    setCalc((c) => {
      if (c.waitingForOperand) return { ...c, display: d, waitingForOperand: false };
      if (c.display === "Error") return { ...c, display: d };
      if (c.display.replace("-", "").replace(".", "").length >= 12) return c;
      return { ...c, display: c.display === "0" ? d : c.display + d };
    });
  }, []);

  const inputDot = useCallback(() => {
    setShake(false);
    setCalc((c) => {
      if (c.waitingForOperand) return { ...c, display: "0.", waitingForOperand: false };
      if (c.display.includes(".")) return c;
      return { ...c, display: c.display + "." };
    });
  }, []);

  const clearAll = useCallback(() => {
    setShake(false);
    setCalc(initialState);
  }, []);

  const backspace = useCallback(() => {
    setShake(false);
    setCalc((c) => {
      if (c.waitingForOperand || c.display === "Error") return { ...c, display: "0" };
      const next = c.display.slice(0, -1);
      return { ...c, display: next === "" || next === "-" ? "0" : next };
    });
  }, []);

  const percent = useCallback(() => {
    setCalc((c) => ({ ...c, display: formatNum(parseFloat(c.display) / 100), waitingForOperand: false }));
  }, []);

  const setOp = useCallback((op: string) => {
    setShake(false);
    setCalc((c) => {
      const cur = parseFloat(c.display);
      if (c.op !== null && c.prev !== null && !c.waitingForOperand) {
        const r = compute(c.prev, cur, c.op);
        return { display: formatNum(r), prev: Number.isFinite(r) ? r : 0, op, waitingForOperand: true };
      }
      return { ...c, prev: Number.isFinite(cur) ? cur : 0, op, waitingForOperand: true };
    });
  }, []);

  const equals = useCallback(async () => {
    /* أولوية العودة: إن طابق ما في الشاشة الرمز السري → نكشف المنصة */
    if (!checkingRef.current) {
      checkingRef.current = true;
      try {
        const cfg = getQuickHideConfig();
        if (cfg.enabled && cfg.hash && /^\d{4,8}$/.test(calc.display)) {
          const h = await hashPin(calc.display);
          if (h === cfg.hash) {
            setHidden(false);
            setHiddenState(false);
            setCalc(initialState);
            return;
          }
        }
      } finally {
        checkingRef.current = false;
      }
    }
    setCalc((c) => {
      if (c.op === null || c.prev === null) return { ...c, waitingForOperand: true };
      const cur = parseFloat(c.display);
      const r = compute(c.prev, cur, c.op);
      if (!Number.isFinite(r)) {
        setShake(true);
        return { display: "Error", prev: null, op: null, waitingForOperand: false };
      }
      return { display: formatNum(r), prev: null, op: null, waitingForOperand: false };
    });
  }, [calc.display]);

  if (!hidden) return null;

  const Btn = ({
    label,
    onClick,
    variant = "num",
    wide,
    ariaLabel,
  }: {
    label: React.ReactNode;
    onClick: () => void;
    variant?: "num" | "op" | "fn" | "eq";
    wide?: boolean;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`h-14 sm:h-16 rounded-2xl text-xl font-semibold transition-transform active:scale-95 select-none ${
        wide ? "col-span-2" : ""
      } ${
        variant === "num"
          ? "bg-neutral-800 text-neutral-50 hover:bg-neutral-700"
          : variant === "op"
            ? "bg-teal-600 text-white hover:bg-teal-500 text-2xl"
            : variant === "fn"
              ? "bg-neutral-600/80 text-neutral-100 hover:bg-neutral-600"
              : "bg-amber-500 text-white hover:bg-amber-400 text-2xl"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex flex-col" role="dialog" aria-label="Calculator">
      {/* شريط علوي محايد */}
      <div className="h-10 shrink-0 flex items-center justify-between px-4 text-neutral-500 text-xs font-semibold">
        <span>Calculator</span>
        <span className="tabular-nums">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <div className="flex-1 flex flex-col justify-end px-4 pb-6 max-w-md w-full mx-auto">
        {/* الشاشة */}
        <div
          className={`text-right text-neutral-50 font-light tabular-nums px-2 pb-8 pt-2 break-all transition-transform ${
            shake ? "animate-[quickhide-shake_0.3s_ease-in-out]" : ""
          } ${calc.display.length > 9 ? "text-4xl" : "text-6xl"}`}
        >
          {calc.display}
        </div>

        {/* الأزرار */}
        <div className="grid grid-cols-4 gap-2.5">
          <Btn label="C" variant="fn" onClick={clearAll} ariaLabel="Clear" />
          <Btn label="⌫" variant="fn" onClick={backspace} ariaLabel="Backspace" />
          <Btn label="%" variant="fn" onClick={percent} ariaLabel="Percent" />
          <Btn label="÷" variant="op" onClick={() => setOp("÷")} ariaLabel="Divide" />

          <Btn label="7" onClick={() => inputDigit("7")} />
          <Btn label="8" onClick={() => inputDigit("8")} />
          <Btn label="9" onClick={() => inputDigit("9")} />
          <Btn label="×" variant="op" onClick={() => setOp("×")} ariaLabel="Multiply" />

          <Btn label="4" onClick={() => inputDigit("4")} />
          <Btn label="5" onClick={() => inputDigit("5")} />
          <Btn label="6" onClick={() => inputDigit("6")} />
          <Btn label="−" variant="op" onClick={() => setOp("−")} ariaLabel="Subtract" />

          <Btn label="1" onClick={() => inputDigit("1")} />
          <Btn label="2" onClick={() => inputDigit("2")} />
          <Btn label="3" onClick={() => inputDigit("3")} />
          <Btn label="+" variant="op" onClick={() => setOp("+")} ariaLabel="Add" />

          <Btn label="0" wide onClick={() => inputDigit("0")} />
          <Btn label="." onClick={inputDot} ariaLabel="Decimal point" />
          <Btn label="=" variant="eq" onClick={() => void equals()} ariaLabel="Equals" />
        </div>
      </div>

      <style jsx global>{`
        @keyframes quickhide-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
