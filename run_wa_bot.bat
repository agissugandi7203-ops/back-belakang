@echo off
title WhatsApp Bot KOMUNITAS
echo ============================================================
echo 🚀 Menjalankan WhatsApp Bot KOMUNITAS (Baileys Gateway)...
echo ============================================================
cd /d "%~dp0"
bun run src/whatsapp_client.ts
pause
