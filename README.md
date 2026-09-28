# DelightApp

Thai dormitory/apartment management web application.

## Current production stack

- Frontend/PWA: `หอพัก/`
- Cloudflare Worker: `delightapp`
- API: `src/d1-api.js`
- Database: Cloudflare D1 (`delightapp-db`)

## Project documents

Start here:

- [PROJECT.md](PROJECT.md) — current production architecture, behavior and technical state
- [USER-MANUAL.md](USER-MANUAL.md) — คู่มือใช้งานระบบสำหรับผู้ดูแลหอพัก
- [ADMIN-GUIDE.md](ADMIN-GUIDE.md) — คู่มือ Owner/Admin/Superadmin และการดูแลระบบ
- [SYSTEM-FLOWS.md](SYSTEM-FLOWS.md) — workflow หลักและความสัมพันธ์ของระบบ
- [D1-MIGRATION.md](D1-MIGRATION.md) — completed Google Sheets -> D1 migration record and rollback notes
- [ROADMAP.md](ROADMAP.md) — future product features and planned capabilities
- [STABILIZATION.md](STABILIZATION.md) — current hardening priorities before major new features
- [AUTH-SESSION-HARDENING-V2.md](AUTH-SESSION-HARDENING-V2.md) — S1 authentication/session implementation contract

Planned/future features should be documented separately from the current production-state document.

## Important

Google Sheets / Apps Script is no longer the primary production backend after the 2026-09-21 D1 cutover. It is retained temporarily as rollback/reference material.
