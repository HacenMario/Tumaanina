#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.7.0 — إضافة مفاتيح الترجمة الجديدة (13 مفتاحاً × 6 لغات) بشكل محدد القسم:
  • قسم counselor: مفتاحان (convoOpenMine / convoOpenPeer) — بعد conversationsHint
  • قسم admin: 11 مفتاحاً لمستحقات المختصين — بعد challengesNote
السكربت موضعي: يبحث عن سطر المرساة داخل القسم نفسه ويُدرج بعده مباشرة.
"""
import re, sys, io

BASE = "/home/z/my-project/tumaanina/src/lib/i18n"

CONVO_KEYS = {
    "ar": [
        '    convoOpenMine: "أنت آخر من كتب — اضغط لمتابعة المحادثة",',
        '    convoOpenPeer: "لديك رسالة هنا — اضغط لفتح المحادثة",',
    ],
    "en": [
        '    convoOpenMine: "You sent the last message — tap to continue",',
        '    convoOpenPeer: "New message waiting — tap to open the chat",',
    ],
    "fr": [
        '    convoOpenMine: "Vous avez envoyé le dernier message — touchez pour continuer",',
        '    convoOpenPeer: "Nouveau message en attente — touchez pour ouvrir la conversation",',
    ],
    "tr": [
        '    convoOpenMine: "Son mesajı siz gönderdiniz — sürdürmek için dokunun",',
        '    convoOpenPeer: "Yeni mesaj var — sohbeti açmak için dokunun",',
    ],
    "ru": [
        '    convoOpenMine: "Последнее сообщение за вами — нажмите, чтобы продолжить",',
        '    convoOpenPeer: "Есть новое сообщение — нажмите, чтобы открыть чат",',
    ],
    "zh": [
        '    convoOpenMine: "您发了最后一条消息——点击继续对话",',
        '    convoOpenPeer: "有新消息——点击打开对话",',
    ],
}

EARNINGS_KEYS = {
    "ar": [
        '    /* ─── v1.7.0: مستحقات المختصين — النسخة الإدارية من «إحصائياتي» ─── */',
        '    earningsTab: "مستحقات المختصين",',
        '    earningsTitle: "مستحقات المختصين",',
        '    earningsDesc: "لكل مختص: جلساته المكتملة وأسعارها بعملتها ومستحقات المنصة 15% منها — نفس مبدأ صفحة «إحصائياتي» لديه",',
        '    earningsAllCompleted: "الجلسات المكتملة (الكل)",',
        '    earningsNetHis: "صافي المختص",',
        '    earningsLastCompleted: "آخر جلسة مكتملة",',
        '    earningsDetails: "التفاصيل",',
        '    earningsHide: "إخفاء",',
        '    earningsClientLabel: "العميل",',
        '    earningsSuspendedBadge: "معلّق",',
        '    earningsNoCounselors: "لا مختصين مسجلين بعد",',
    ],
    "en": [
        '    /* ─── v1.7.0: counselor earnings — the admin version of "My Stats" ─── */',
        '    earningsTab: "Counselor Earnings",',
        '    earningsTitle: "Counselor Earnings",',
        '    earningsDesc: "For each counselor: completed sessions with per-currency prices and the platform\'s 15% share — same principle as their own \\"My Stats\\" page",',
        '    earningsAllCompleted: "Completed sessions (all)",',
        '    earningsNetHis: "Counselor\'s net",',
        '    earningsLastCompleted: "Last completed session",',
        '    earningsDetails: "Details",',
        '    earningsHide: "Hide",',
        '    earningsClientLabel: "Client",',
        '    earningsSuspendedBadge: "Suspended",',
        '    earningsNoCounselors: "No counselors registered yet",',
    ],
    "fr": [
        '    /* ─── v1.7.0 : revenus des spécialistes — la version admin de « Mes statistiques » ─── */',
        '    earningsTab: "Revenus des spécialistes",',
        '    earningsTitle: "Revenus des spécialistes",',
        '    earningsDesc: "Pour chaque spécialiste : séances terminées avec prix par devise et part de la plateforme (15 %) — même principe que sa page « Mes statistiques »",',
        '    earningsAllCompleted: "Séances terminées (total)",',
        '    earningsNetHis: "Net du spécialiste",',
        '    earningsLastCompleted: "Dernière séance terminée",',
        '    earningsDetails: "Détails",',
        '    earningsHide: "Masquer",',
        '    earningsClientLabel: "Client",',
        '    earningsSuspendedBadge: "Suspendu",',
        '    earningsNoCounselors: "Aucun spécialiste inscrit pour l\'instant",',
    ],
    "tr": [
        '    /* ─── v1.7.0: uzman kazançları — "İstatistiklerim"in yönetici sürümü ─── */',
        '    earningsTab: "Uzman Kazançları",',
        '    earningsTitle: "Uzman Kazançları",',
        '    earningsDesc: "Her uzman için: tamamlanan seanslar, para birimi bazında fiyatlar ve platformun %15 payı — kendi \\"İstatistiklerim\\" sayfasıyla aynı mantık",',
        '    earningsAllCompleted: "Tamamlanan seanslar (toplam)",',
        '    earningsNetHis: "Uzmanın neti",',
        '    earningsLastCompleted: "Son tamamlanan seans",',
        '    earningsDetails: "Ayrıntılar",',
        '    earningsHide: "Gizle",',
        '    earningsClientLabel: "Danışan",',
        '    earningsSuspendedBadge: "Askıda",',
        '    earningsNoCounselors: "Henüz kayıtlı uzman yok",',
    ],
    "ru": [
        '    /* ─── v1.7.0: доходы специалистов — админ-версия «Моей статистики» ─── */',
        '    earningsTab: "Доходы специалистов",',
        '    earningsTitle: "Доходы специалистов",',
        '    earningsDesc: "Для каждого специалиста: завершённые сессии, цены по валютам и доля платформы 15% — как на его странице «Моя статистика»",',
        '    earningsAllCompleted: "Завершённые сессии (все)",',
        '    earningsNetHis: "Чистыми у специалиста",',
        '    earningsLastCompleted: "Последняя завершённая сессия",',
        '    earningsDetails: "Подробности",',
        '    earningsHide: "Скрыть",',
        '    earningsClientLabel: "Клиент",',
        '    earningsSuspendedBadge: "Приостановлен",',
        '    earningsNoCounselors: "Специалисты ещё не зарегистрированы",',
    ],
    "zh": [
        '    /* ─── v1.7.0: 专家收益 —— “我的统计”的管理版 ─── */',
        '    earningsTab: "专家收益",',
        '    earningsTitle: "专家收益",',
        '    earningsDesc: "每位专家：已完成咨询、按币种计价及平台15%分成——与其个人“我的统计”页面同一原理",',
        '    earningsAllCompleted: "已完成咨询（全部）",',
        '    earningsNetHis: "专家净额",',
        '    earningsLastCompleted: "最近完成的咨询",',
        '    earningsDetails: "详情",',
        '    earningsHide: "收起",',
        '    earningsClientLabel: "客户",',
        '    earningsSuspendedBadge: "已停用",',
        '    earningsNoCounselors: "尚未注册专家",',
    ],
}


def insert_after(lines, anchor_re, new_lines, label):
    """يُدرج new_lines بعد أول سطر يطابق anchor_re — يعيد (الأسطر، نجاح)"""
    rx = re.compile(anchor_re)
    for i, ln in enumerate(lines):
        if rx.search(ln):
            return lines[: i + 1] + new_lines + lines[i + 1 :], True
    return lines, False


ok_all = True
for lang in ["ar", "en", "fr", "tr", "ru", "zh"]:
    path = f"{BASE}/{lang}.ts"
    with io.open(path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    if any("convoOpenMine" in ln for ln in lines):
        print(f"[{lang}] convoOpenMine موجود مسبقاً — تخطٍ")
    else:
        lines, ok = insert_after(lines, r"^\s*conversationsHint:", CONVO_KEYS[lang], f"{lang}/counselor")
        ok_all &= ok
        if not ok:
            print(f"[{lang}] ❌ مرساة conversationsHint غير موجودة")

    if any("earningsTab" in ln for ln in lines):
        print(f"[{lang}] earningsTab موجود مسبقاً — تخطٍ")
    else:
        lines, ok = insert_after(lines, r"^\s*challengesNote:", EARNINGS_KEYS[lang], f"{lang}/admin")
        ok_all &= ok
        if not ok:
            print(f"[{lang}] ❌ مرساة challengesNote غير موجودة")

    with io.open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[{lang}] ✓")

print("ALL OK" if ok_all else "SOME ANCHORS FAILED", file=sys.stderr)
sys.exit(0 if ok_all else 1)
