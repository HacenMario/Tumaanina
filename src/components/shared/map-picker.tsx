"use client";

/* ═ v1.17.0 — منتقي الموقع على الخريطة يدوياً (تصحيح الموقع بدقة) ═
   خريطة بلاطات OpenStreetMap خفيفة بلا أي مكتبة خارجية:
   • السحب بالإصبع/الفأرة يحرّك الخريطة، والنقطة الحمراء في المنتصف هي الموقع
   • أزرار تكبير/تصغير + نقر مزدوج للتقريب
   • كل تحرير للسحب يبلّغ الأب بالإحداثيات الجديدة فوراً (lat/lng بدقة 1e-6)
   • تُستعمل في لوحة العيادة لتحديد/تصحيح موقع العيادة يدوياً — لتجنب
     أخطاء التحديد التلقائي GPS وحده */

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Crosshair } from "lucide-react";

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 19;

function lngToWorldX(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE * Math.pow(2, z);
}
function worldXToLng(x: number, z: number): number {
  return (x / (TILE * Math.pow(2, z))) * 360 - 180;
}
function latToWorldY(lat: number, z: number): number {
  const s = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z);
}
function worldYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function MapPicker({
  lat,
  lng,
  onChange,
  className = "h-72",
  initialZoom = 15,
}: {
  /** الإحداثيات الحالية (قد تكون null فيبدأ من مركز الجزائر) */
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  className?: string;
  initialZoom?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(initialZoom);
  const [center, setCenter] = useState<{ x: number; y: number }>(() => ({
    x: lngToWorldX(lng ?? 2.6, initialZoom),
    y: latToWorldY(lat ?? 28.5, initialZoom),
  }));
  const dragRef = useRef<{ px: number; py: number } | null>(null);
  /* آخر إحداثيات أبلغنا بها الأب — لتفادي إعادة التمركز بسبب تحديثنا نحن */
  const lastEmitted = useRef<string>("");

  /* حجم الحاوية */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* إعادة التمركز عندما تتغير الإحداثيات من الخارج (زر GPS مثلاً) */
  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = `${lat},${lng}`;
    if (key === lastEmitted.current) return;
    setCenter({ x: lngToWorldX(lng, zoom), y: latToWorldY(lat, zoom) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const emit = useCallback(
    (c: { x: number; y: number }, z: number) => {
      const la = Math.round(worldYToLat(c.y, z) * 1e6) / 1e6;
      const lo = Math.round(worldXToLng(c.x, z) * 1e6) / 1e6;
      lastEmitted.current = `${la},${lo}`;
      onChange(la, lo);
    },
    [onChange]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    dragRef.current = { px: e.clientX, py: e.clientY };
    setCenter((c) => ({ x: c.x - dx, y: c.y - dy }));
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setCenter((c) => {
      emit(c, zoom);
      return c;
    });
  };

  const setZoomAt = (z: number) => {
    const nz = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (nz === zoom) return;
    const scale = Math.pow(2, nz) / Math.pow(2, zoom);
    setCenter((c) => ({ x: c.x * scale, y: c.y * scale }));
    setZoom(nz);
    setCenter((c) => {
      emit(c, nz);
      return c;
    });
  };

  /* نطاق البلاطات الظاهرة */
  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (size.w > 0 && size.h > 0) {
    const n = Math.pow(2, zoom);
    const left = center.x - size.w / 2;
    const top = center.y - size.h / 2;
    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + size.w) / TILE);
    const y0 = Math.floor(top / TILE);
    const y1 = Math.floor((top + size.h) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push({
          key: `${zoom}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`,
          left: tx * TILE - left,
          top: ty * TILE - top,
        });
      }
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border/60 bg-muted/40 ${className}`} dir="ltr">
      <div
        ref={boxRef}
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setZoomAt(zoom + 1)}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.key} src={t.url} alt="" width={TILE} height={TILE} draggable={false} className="absolute select-none pointer-events-none" style={{ left: t.left, top: t.top }} loading="lazy" />
        ))}
      </div>

      {/* النقطة الحمراء في المنتصف = الموقع المحدد */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <span className="relative flex items-center justify-center">
          <span className="absolute h-9 w-9 rounded-full bg-red-500/25 animate-ping" />
          <span className="h-4 w-4 rounded-full bg-red-500 ring-2 ring-white shadow-lg" />
        </span>
      </div>
      <Crosshair className="absolute top-2 start-2 h-4 w-4 text-foreground/40 pointer-events-none" />

      {/* أزرار التكبير/التصغير */}
      <div className="absolute top-2 end-2 flex flex-col gap-1">
        <button type="button" aria-label="zoom in" onClick={() => setZoomAt(zoom + 1)} className="h-8 w-8 rounded-lg bg-card/95 border border-border shadow flex items-center justify-center hover:bg-muted">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="zoom out" onClick={() => setZoomAt(zoom - 1)} className="h-8 w-8 rounded-lg bg-card/95 border border-border shadow flex items-center justify-center hover:bg-muted">
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* الإسناد الإلزامي لـ OpenStreetMap */}
      <span className="absolute bottom-1 end-1 text-[9px] font-semibold text-foreground/60 bg-card/85 rounded px-1 pointer-events-none">
        © OpenStreetMap contributors
      </span>
    </div>
  );
}
