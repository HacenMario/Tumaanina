#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.1.0 — استقلالية كاملة عن المنصة الأصلية:
إزالة كل أثر لـ rafiqi/رفيقي + إعادة تسمية victim→client (الملفات والمسارات والمفاتيح الظاهرة في الكود)
"""
import os, re, sys

ROOT = "/home/z/my-project/tumaanina"
SCOPES = ["src", "public", "README.md", "package.json", "server.js"]

# 1) عمليات نقل الملفات
MOVES = [
    ("src/components/views/victim-start.tsx",    "src/components/views/client-start.tsx"),
    ("src/components/views/victim-topics.tsx",   "src/components/views/client-topics.tsx"),
    ("src/components/views/victim-slots.tsx",    "src/components/views/client-slots.tsx"),
    ("src/components/views/victim-find.tsx",     "src/components/views/client-find.tsx"),
    ("src/components/views/victim-sessions.tsx", "src/components/views/client-sessions.tsx"),
    ("src/lib/server/victim-challenge.ts",       "src/lib/server/client-challenge.ts"),
    ("src/app/api/victim",                       "src/app/api/client"),
]

# 2) الاستبدالات النصية بالترتيب
REPLACEMENTS = [
    ("رفيقي النفسي", "طمأنينة"),
    ("رفيقي", "طمأنينة"),
    ("Rafiqi Annafsi", "Tumaanina"),
    ("rafiqi-nafsi", "tumaanina"),
    ("Rafiqi", "Tumaanina"),
    ("rafiqi", "tumaanina"),
    # مسارات الملفات المعاد تسميتها
    ("views/victim-", "views/client-"),
    ("server/victim-challenge", "server/client-challenge"),
    # معرّفات الواجهات (view ids)
    ('"victim-start"', '"client-start"'),
    ('"victim-topics"', '"client-topics"'),
    ('"victim-slots"', '"client-slots"'),
    ('"victim-find"', '"client-find"'),
    ('"victim-sessions"', '"client-sessions"'),
    # مسار API
    ("/api/victim", "/api/client"),
    # مفتاح قسم الترجمة
    ("\n  victim: {", "\n  client: {"),
    # استخدامات المفتاح
    ("t.victim.", "t.client."),
    # أسماء المكوّنات
    ("VictimFind", "ClientFind"),
    ("VictimStart", "ClientStart"),
    ("VictimSlots", "ClientSlots"),
    ("VictimSessions", "ClientSessions"),
    ("VictimTopics", "ClientTopics"),
    # مسودة المتصفح في المخزن
    ("victimDraft", "clientDraft"),
    ("VictimDraft", "ClientDraft"),
    # المفردات في التعليقات والنصوص
    ("المتضرر", "العميل"),
    ("متضرر", "عميل"),
]

EXTS = (".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".webmanifest", ".html")

def iter_files():
    for scope in SCOPES:
        p = os.path.join(ROOT, scope)
        if os.path.isfile(p):
            yield p
        elif os.path.isdir(p):
            for dirpath, dirnames, filenames in os.walk(p):
                dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".next")]
                for fn in filenames:
                    if fn.endswith(EXTS):
                        yield os.path.join(dirpath, fn)

def main():
    # النقل أولاً
    for src, dst in MOVES:
        s, d = os.path.join(ROOT, src), os.path.join(ROOT, dst)
        if os.path.exists(s):
            os.makedirs(os.path.dirname(d), exist_ok=True)
            os.rename(s, d)
            print(f"[move] {src} -> {dst}")
        else:
            print(f"[skip-missing] {src}")

    total_files, total_repl = 0, 0
    for path in iter_files():
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue
        orig = content
        for old, new in REPLACEMENTS:
            if old in content:
                content = content.replace(old, new)
        if content != orig:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            total_files += 1
            total_repl += sum(orig.count(o) for o, _ in REPLACEMENTS)
            print(f"[edit] {os.path.relpath(path, ROOT)}")
    print(f"\n=== done: {total_files} files edited, ~{total_repl} replacements ===")

if __name__ == "__main__":
    main()
