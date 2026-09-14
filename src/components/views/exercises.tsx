"use client";

/**
 * v2.14.0 — صفحة تمارين التهدئة (طلب المستخدم):
 * - تعرض التمارين المدمجة (التنفس التفاعلي + 5-4-3-2-1 + المكان الآمن)
 *   والتمارين التي أضافها المختصون والأدمين.
 * - المختص والأدمين يضيفان تمريناً جديداً بكامل تفاصيله من هذه الصفحة نفسها
 *   مع رفع صور توضيحية لخطوات التنفيذ (تُضغط في المتصفح قبل الإرسال).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Wind, Clock3, Trash2, ImagePlus, X, ListOrdered, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { BUILTIN_EXERCISES } from "@/lib/exercises-builtin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BreathingExerciseDialog } from "@/components/shared/breathing-exercise";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";
import { playSound } from "@/lib/sounds";
import type { AppLang } from "@/lib/constants";

interface CustomExercise {
  id: string;
  title: string;
  description: string;
  steps: string[];
  images: string[];
  durationMinutes: number | null;
  createdByRole: string;
  creatorName: string | null;
  createdAt: string | null;
}

const MAX_IMAGES = 4;

/* ضغط الصورة في المتصفح — نفس أسلوب مجتمع طمأنينة (JPEG q82، أقصى 1080px) */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1080;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no-ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("bad-image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("bad-file"));
    reader.readAsDataURL(file);
  });
}

export function ExercisesView() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [custom, setCustom] = useState<CustomExercise[]>([]);
  const [loading, setLoading] = useState(true);

  /* نافذة تفاصيل التمرين */
  const [detail, setDetail] = useState<{ title: string; description: string; steps: string[]; images: string[]; minutes: number } | null>(null);
  /* تمرين التنفس التفاعلي */
  const [breathingOpen, setBreathingOpen] = useState(false);
  /* نموذج إضافة تمرين (مختص/أدمين) */
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [minutes, setMinutes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* حذف تمرين */
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canAdd = !!user && (user.role === "COUNSELOR" || user.role === "ADMIN");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/exercises");
      if (res.ok) {
        const d = await res.json();
        setCustom(d.exercises || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    for (const f of picked) {
      try {
        const dataUrl = await compressImage(f);
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, dataUrl] : cur));
      } catch {
        /* تجاهل الصورة المعطوبة */
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitExercise = async () => {
    if (!user || busy) return;
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!title.trim() || steps.length === 0) {
      setErr(t.exercises.errRequired);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          title: title.trim(),
          description: description.trim(),
          steps,
          images,
          durationMinutes: minutes ? Number(minutes) : undefined,
        }),
      });
      if (res.ok) {
        playSound("success");
        showAppToast(t.exercises.addedTitle, t.exercises.addedSub);
        setAddOpen(false);
        setTitle("");
        setDescription("");
        setStepsText("");
        setMinutes("");
        setImages([]);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error === "IMAGE_TOO_LARGE" ? t.exercises.errImage : t.common.error);
      }
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const removeExercise = async () => {
    if (!deleteId || !user) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/exercises/${deleteId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) load();
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  };

  const ex = t.exercises;
  const builtinLang = (BUILTIN_EXERCISES[0].t as Record<string, unknown>)[lang] ? (lang as AppLang) : "ar";

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 md:py-12">
      <BackButton />
      <div className="flex items-center justify-between gap-3 mb-2">
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-black flex items-center gap-2.5">
          <Wind className="h-7 w-7 text-primary" />
          {ex.title}
        </motion.h1>
        {canAdd && (
          <Button
            className="gradient-primary text-white font-bold rounded-xl shrink-0"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {ex.addBtn}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{ex.subtitle}</p>

      {/* ─── التمارين المدمجة ─── */}
      <div className="space-y-3">
        {BUILTIN_EXERCISES.map((b, i) => {
          const loc = b.t[builtinLang];
          return (
            <motion.div key={b.slug} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-border/70 hover:border-primary/40 transition-colors">
                <CardContent className="p-4 sm:p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">
                    {b.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black">{loc.title}</span>
                      <Badge variant="secondary" className="gap-1 text-[10px] font-bold">
                        <Clock3 className="h-3 w-3" />
                        {ex.minutes.replace("{n}", String(b.minutes))}
                      </Badge>
                      {b.interactive && (
                        <Badge className="bg-primary/12 text-primary border-0 gap-1 text-[10px] font-bold">
                          <Sparkles className="h-3 w-3" />
                          {ex.interactiveBadge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">{loc.description}</p>
                  </div>
                  <Button
                    size="sm"
                    className="gradient-primary text-white font-bold rounded-lg shrink-0"
                    onClick={() => {
                      if (b.interactive) setBreathingOpen(true);
                      else setDetail({ title: loc.title, description: loc.description, steps: loc.steps, images: [], minutes: b.minutes });
                    }}
                  >
                    {ex.openBtn}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ─── تمارين المختصين والأدمين ─── */}
      <div className="flex items-center gap-2 mt-8 mb-3">
        <h2 className="text-lg font-black">{ex.customTitle}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black">{custom.length}</span>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Card className="h-20 animate-pulse bg-muted/50 border-0" />
        </div>
      ) : custom.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center text-sm font-semibold text-muted-foreground">
            {ex.customEmpty}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {custom.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.05 }}>
              <Card className="border-border/70 hover:border-primary/40 transition-colors">
                <CardContent className="p-4 sm:p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <ListOrdered className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black" dir="auto">{c.title}</span>
                      {c.durationMinutes ? (
                        <Badge variant="secondary" className="gap-1 text-[10px] font-bold">
                          <Clock3 className="h-3 w-3" />
                          {ex.minutes.replace("{n}", String(c.durationMinutes))}
                        </Badge>
                      ) : null}
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2" dir="auto">{c.description}</p>}
                    <p className="text-[11px] font-bold text-muted-foreground/80 mt-1.5">
                      {ex.byCreator.replace("{name}", c.creatorName || "—")}
                      {c.images?.length > 0 && <span className="ms-2 inline-flex items-center gap-1"><ImagePlus className="h-3 w-3" />{c.images.length}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg font-bold"
                      onClick={() => setDetail({ title: c.title, description: c.description, steps: c.steps, images: c.images || [], minutes: c.durationMinutes || 5 })}
                    >
                      {ex.openBtn}
                    </Button>
                    {user && (user.role === "ADMIN" || (c.createdByRole === "COUNSELOR" && user.role === "COUNSELOR")) && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-lg text-destructive border-destructive/40 h-8 w-8"
                        aria-label={ex.deleteBtn}
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── نافذة تفاصيل التمرين ─── */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-lg flex items-center gap-2">
              <Wind className="h-5 w-5 text-primary shrink-0" />
              <span dir="auto">{detail?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {detail.description && <p className="text-sm text-muted-foreground leading-relaxed" dir="auto">{detail.description}</p>}
              <div className="space-y-2">
                {detail.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
                    <span className="text-xs font-black text-primary font-mono shrink-0 mt-0.5" dir="ltr">{i + 1}</span>
                    <p className="text-sm font-semibold leading-relaxed flex-1" dir="auto">{s}</p>
                  </div>
                ))}
              </div>
              {detail.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {detail.images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={img}
                      alt={`${detail.title} — ${i + 1}`}
                      className="rounded-xl border border-border object-cover w-full aspect-[4/3]"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {ex.minutes.replace("{n}", String(detail.minutes))}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── تمرين التنفس التفاعلي ─── */}
      <BreathingExerciseDialog open={breathingOpen} onOpenChange={setBreathingOpen} />

      {/* ─── نموذج إضافة تمرين (مختص/أدمين) ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <Plus className="h-4.5 w-4.5 text-primary" />
              {ex.addTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-black">{ex.fTitle}</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} dir="auto" className="rounded-xl" placeholder={ex.fTitlePh} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black">{ex.fDesc}</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1200} dir="auto" className="rounded-xl min-h-16" placeholder={ex.fDescPh} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black">{ex.fSteps}</label>
              <Textarea
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                dir="auto"
                className="rounded-xl min-h-28"
                placeholder={ex.fStepsPh}
              />
              <p className="text-[10px] font-bold text-muted-foreground">{ex.fStepsHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-black">{ex.fMinutes}</label>
                <Input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" dir="ltr" className="rounded-xl font-mono" placeholder="5" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5 text-primary" />
                {ex.fImages}
                <span className="font-mono text-muted-foreground" dir="ltr">{images.length}/{MAX_IMAGES}</span>
              </label>
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`img-${i + 1}`} className="rounded-lg border border-border object-cover w-full aspect-square" />
                      <button
                        type="button"
                        onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -end-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                        aria-label={t.common.close}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {images.length < MAX_IMAGES && (
                /* v1.19.0: المدخل شفاف فوق الزر مباشرة — يفتح منتقي الملفات على كل الهواتف */
                <div className="relative">
                  <Button type="button" variant="outline" className="w-full rounded-xl font-bold border-dashed">
                    <ImagePlus className="h-4 w-4" />
                    {ex.fAddImage}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => { void pickImages(e.target.files); e.currentTarget.value = ""; }} />
                </div>
              )}
              <p className="text-[10px] font-bold text-muted-foreground">{ex.fImagesHint}</p>
            </div>
            {err && <p className="text-xs font-bold text-destructive">{err}</p>}
            <Button className="w-full gradient-primary text-white font-black rounded-xl h-11" disabled={busy || !title.trim()} onClick={() => void submitExercise()}>
              {busy ? t.common.loading : ex.submitBtn}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── تأكيد حذف تمرين ─── */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{ex.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">{ex.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl font-bold">{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl font-bold bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void removeExercise();
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t.dm.clearConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
