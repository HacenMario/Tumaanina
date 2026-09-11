#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.6.0 — إضافة مفاتيح الترجمة الجديدة بالغات الست (حقن موضعي حسب القسم):
  • counselor.groupChatHint        — تلميح الضغطة الطويلة في فضاء المختصين
  • client.rescheduleNoSlots       — لا مواعيد مسموحة في اليوم المختار
  • admin.challengesTab + 9 مفاتيح — لوحة التحديين
"""
import io, sys

BASE = "/home/z/my-project/tumaanina/src/lib/i18n"
KEYS = {
    "ar": {
        "groupChatHint": "تلميح: اضغط مطوّلاً 3 ثوانٍ على رسالتك لتعديلها أو حذفها.",
        "rescheduleNoSlots": "لا توجد مواعيد يسمح بها المختص في هذا اليوم — اختر يوماً آخر.",
        "challengesTab": "التحديات",
        "challengeCounselorTitle": "تحدي المختصين — لغز علم الجزائر",
        "challengeCounselorDesc": "أول من يكتشف العدد السري من الضغطات يفوز بالتاج.",
        "challengeVictimTitle": "تحدي العملاء — التزام 4 مواعيد متتالية",
        "challengeVictimDesc": "أول عميل يحترم 4 مواعيد متتالية بتأخير ≤ 10 دقائق يفوز.",
        "challengeRunning": "يعمل الآن",
        "challengeStopped": "متوقف",
        "challengeEnableLabel": "تفعيل التحدي:",
        "challengeDurationLabel": "مدة الصلاحية بالأيام (0 = بلا حد)",
        "challengeDurationHint": "المدة تُحسب من لحظة الحفظ، وعند بلوغها يتوقف التحدي وتختفي نافذته تلقائياً. الفوز يوقفه فوراً أيضاً — استعمل «إعادة التشغيل» لبدء دورة جديدة.",
        "challengeResetBtn": "إعادة التشغيل",
        "challengeNoWinner": "لا يوجد فائز بعد — التحدي في انتظار أول من يحقق شرطه.",
        "challengesNote": "ملاحظة: التعطيل أو الفوز يخفي نافذة التحدي عن كل المستخدمين فوراً، وإعادة التشغيل تمسح الفائز وتبدأ دورة جديدة للجميع.",
    },
    "en": {
        "groupChatHint": "Tip: press and hold your message for 3 seconds to edit or delete it.",
        "rescheduleNoSlots": "No slots allowed by this specialist on that day — pick another day.",
        "challengesTab": "Challenges",
        "challengeCounselorTitle": "Specialists challenge — the Algeria flag riddle",
        "challengeVictimTitle": "Clients challenge — 4 consecutive appointments",
        "challengeCounselorDesc": "First to discover the secret number of taps wins the crown.",
        "challengeVictimDesc": "First client to keep 4 consecutive appointments with ≤ 10 min delay wins.",
        "challengeRunning": "Running",
        "challengeStopped": "Stopped",
        "challengeEnableLabel": "Enable challenge:",
        "challengeDurationLabel": "Validity in days (0 = unlimited)",
        "challengeDurationHint": "Duration counts from the moment you save; when it elapses the challenge stops and its window disappears automatically. Winning stops it instantly too — use \"Restart\" for a fresh round.",
        "challengeResetBtn": "Restart",
        "challengeNoWinner": "No winner yet — the challenge awaits its first achiever.",
        "challengesNote": "Note: disabling or winning hides the challenge window for everyone instantly; restarting clears the winner and starts a new round for all.",
    },
    "fr": {
        "groupChatHint": "Astuce : maintenez votre message 3 secondes pour le modifier ou le supprimer.",
        "rescheduleNoSlots": "Aucun créneau autorisé par ce spécialiste ce jour-là — choisissez un autre jour.",
        "challengesTab": "Défis",
        "challengeCounselorTitle": "Défi des spécialistes — l'énigme du drapeau",
        "challengeVictimTitle": "Défi des clients — 4 rendez-vous consécutifs",
        "challengeCounselorDesc": "Le premier à découvrir le nombre secret de clics gagne la couronne.",
        "challengeVictimDesc": "Le premier client à honorer 4 rendez-vous consécutifs (retard ≤ 10 min) gagne.",
        "challengeRunning": "Actif",
        "challengeStopped": "Arrêté",
        "challengeEnableLabel": "Activer le défi :",
        "challengeDurationLabel": "Durée de validité en jours (0 = illimitée)",
        "challengeDurationHint": "La durée se calcule dès l'enregistrement ; une fois écoulée, le défi s'arrête et sa fenêtre disparaît automatiquement. Une victoire l'arrête aussi instantanément — utilisez « Redémarrer » pour une nouvelle manche.",
        "challengeResetBtn": "Redémarrer",
        "challengeNoWinner": "Pas encore de gagnant — le défi attend son premier héros.",
        "challengesNote": "Remarque : la désactivation ou une victoire masque instantanément la fenêtre du défi pour tout le monde ; le redémarrage efface le gagnant et lance une nouvelle manche.",
    },
    "tr": {
        "groupChatHint": "İpucu: Mesajınızı düzenlemek veya silmek için 3 saniye basılı tutun.",
        "rescheduleNoSlots": "Bu gün için uzmanın izin verdiği saat yok — başka bir gün seçin.",
        "challengesTab": "Yarışmalar",
        "challengeCounselorTitle": "Uzman yarışması — Cezayir bayrağı bilmecesi",
        "challengeVictimTitle": "Danışan yarışması — 4 ardışık randevu",
        "challengeCounselorDesc": "Gizli tıklama sayısını ilk bulan taçı kazanır.",
        "challengeVictimDesc": "4 ardışık randevuya (≤ 10 dk gecikme) uyan ilk danışan kazanır.",
        "challengeRunning": "Aktif",
        "challengeStopped": "Durduruldu",
        "challengeEnableLabel": "Yarışmayı etkinleştir:",
        "challengeDurationLabel": "Geçerlilik süresi (gün, 0 = sınırsız)",
        "challengeDurationHint": "Süre kaydettiğiniz anda başlar; dolduğunda yarışma durur ve penceresi otomatik kaybolur. Kazanmak da onu anında durdurur — yeni tur için \"Yeniden başlat\"ı kullanın.",
        "challengeResetBtn": "Yeniden başlat",
        "challengeNoWinner": "Henüz kazanan yok — yarışma ilk başaranı bekliyor.",
        "challengesNote": "Not: Devre dışı bırakma veya kazanma, yarışma penceresini herkes için anında gizler; yeniden başlatma kazananı siler ve herkes için yeni tur başlatır.",
    },
    "ru": {
        "groupChatHint": "Подсказка: удерживайте своё сообщение 3 секунды, чтобы изменить или удалить его.",
        "rescheduleNoSlots": "В этот день нет разрешённых специалистом часов — выберите другой день.",
        "challengesTab": "Испытания",
        "challengeCounselorTitle": "Испытание специалистов — загадка флага",
        "challengeVictimTitle": "Испытание клиентов — 4 встречи подряд",
        "challengeCounselorDesc": "Первый, кто разгадает тайное число нажатий, получает корону.",
        "challengeVictimDesc": "Первый клиент, посетивший 4 встречи подряд (опоздание ≤ 10 мин), побеждает.",
        "challengeRunning": "Идёт",
        "challengeStopped": "Остановлено",
        "challengeEnableLabel": "Включить испытание:",
        "challengeDurationLabel": "Срок действия в днях (0 = без ограничений)",
        "challengeDurationHint": "Срок отсчитывается с момента сохранения; по истечении испытание останавливается и его окно исчезает автоматически. Победа тоже мгновенно останавливает его — «Перезапуск» начинает новый раунд.",
        "challengeResetBtn": "Перезапуск",
        "challengeNoWinner": "Победителя пока нет — испытание ждёт первого героя.",
        "challengesNote": "Примечание: отключение или победа мгновенно скрывают окно испытания у всех; перезапуск стирает победителя и начинает новый раунд.",
    },
    "zh": {
        "groupChatHint": "提示：长按您的消息3秒即可编辑或删除。",
        "rescheduleNoSlots": "该专家当天没有允许的时段——请选择其他日期。",
        "challengesTab": "挑战",
        "challengeCounselorTitle": "专家挑战——国旗之谜",
        "challengeVictimTitle": "客户挑战——连续赴约4次",
        "challengeCounselorDesc": "最先猜出秘密点击次数的人赢得王冠。",
        "challengeVictimDesc": "首个连续4次准时赴约（迟到≤10分钟）的客户获胜。",
        "challengeRunning": "进行中",
        "challengeStopped": "已停止",
        "challengeEnableLabel": "启用挑战：",
        "challengeDurationLabel": "有效天数（0 = 不限）",
        "challengeDurationHint": "时长自保存之时起算；到期后挑战自动停止且窗口消失。有人获胜也会立即停止——用「重新开始」开启新一轮。",
        "challengeResetBtn": "重新开始",
        "challengeNoWinner": "暂无获胜者——挑战等待第一位达成者。",
        "challengesNote": "注意：停用或获胜会立即对所有人隐藏挑战窗口；重新开始会清除获胜者并为所有人开启新一轮。",
    },
}


def inject(path: str, lang: str) -> None:
    k = KEYS[lang]
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()

    # 1) counselor.groupChatHint — بعد groupChatOpen في قسم counselor
    anchor = None
    for line in src.split("\n"):
        if "groupChatOpen:" in line:
            anchor = line
            break
    assert anchor, f"groupChatOpen not found in {path}"
    indent = anchor[: len(anchor) - len(anchor.lstrip())]
    hint_line = f'{indent}groupChatHint: "{k["groupChatHint"]}",'
    src = src.replace(anchor, anchor + "\n" + hint_line, 1)

    # 2) client.rescheduleNoSlots — بعد rescheduleHint
    anchor = None
    for line in src.split("\n"):
        if "rescheduleHint:" in line:
            anchor = line
            break
    assert anchor, f"rescheduleHint not found in {path}"
    indent = anchor[: len(anchor) - len(anchor.lstrip())]
    line2 = f'{indent}rescheduleNoSlots: "{k["rescheduleNoSlots"]}",'
    src = src.replace(anchor, anchor + "\n" + line2, 1)

    # 3) admin.* — بعد foundersTab
    anchor = None
    for line in src.split("\n"):
        if "foundersTab:" in line:
            anchor = line
            break
    assert anchor, f"foundersTab not found in {path}"
    indent = anchor[: len(anchor) - len(anchor.lstrip())]
    block = "\n".join(
        f'{indent}{key}: "{k[key]}",'
        for key in [
            "challengesTab",
            "challengeCounselorTitle",
            "challengeCounselorDesc",
            "challengeVictimTitle",
            "challengeVictimDesc",
            "challengeRunning",
            "challengeStopped",
            "challengeEnableLabel",
            "challengeDurationLabel",
            "challengeDurationHint",
            "challengeResetBtn",
            "challengeNoWinner",
            "challengesNote",
        ]
    )
    src = src.replace(anchor, anchor + "\n" + block, 1)

    with io.open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print("OK", path)


for lang in ["ar", "en", "fr", "tr", "ru", "zh"]:
    inject(f"{BASE}/{lang}.ts", lang)

print("DONE — مفاتيح ×6 مُضافة")
