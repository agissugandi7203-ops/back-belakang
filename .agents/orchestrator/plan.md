# Verification & Audit Plan: KOMUNITAS

## Architecture & Code Layout
- Backend: `c:\ryuka\lks-ai-2026\KOMUNITAS\backend` (TypeScript API server, database setup)
- Frontend: `c:\ryuka\lks-ai-2026\KOMUNITAS\frontend` (Vite React Tailwind CSS)

## Verification Strategy
- **R1. Citizen Report GPS Mandatori**:
  - Verify backend database schema and API validation (requires lat/lng).
  - Verify frontend form submission prevents submitting without GPS coordinates.
  - Verify Admin details panel renders coordinates correctly.
- **R2. Inline Webcam Capture & Photo Upload**:
  - Verify "Ambil Foto" opens webcam (navigator.mediaDevices.getUserMedia).
  - Verify image capture to base64 payload.
  - Verify file picker fallback uploads file correctly.
- **R3. "Lainnya" Custom Category**:
  - Verify custom text input appears when "Lainnya" is selected.
  - Verify regex sanitization blocks non-alphabetical characters.
  - Verify final category name value gets submitted and stored.
- **R4. About Us Page & Footer**:
  - Verify `/about` route exists, renders Vision & Mission, Privacy Policy, Terms of Service.
  - Check layout/styles for `taste-skill` compliance.
  - Verify footer links target `/about` properly.
- **R5. Sidebar Three-Dots Menu**:
  - Check sidebar CSS/Tailwind classes to ensure three-dots history menu button does not crop on narrow widths.

## Milestones
| # | Milestone Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Exploration & Code Mapping | Locate files, verify project files exist, build check. | None | DONE |
| M2 | R1 & R2 Verification | Code and functional validation of GPS constraints and Webcam interface. | M1 | DONE |
| M3 | R3, R4 & R5 Verification | Code and functional validation of Lainnya, About, Sidebar. | M1 | DONE |
| M4 | Forensic Audit | Integrity validation using static and runtime checks to ensure no mock/dummy implementations. | M2, M3 | DONE |

## Team Roster
| Agent ID | Role | Work Item | Status | Handoff Link |
|---|---|---|---|---|
| 64a3ca35-4c47-4c15-adba-d66f512a7a81 | Code explorer and mapper | Exploration & Code Mapping | DONE | file:///c:/ryuka/lks-ai-2026/KOMUNITAS/backend/.agents/teamwork_preview_explorer_m1/handoff.md |
| 3c39c9bb-092c-4285-b51a-9061ce48cb4a | Build & API Verification Worker | R1-R5 Build & Verification | DONE | file:///c:/ryuka/lks-ai-2026/KOMUNITAS/backend/.agents/teamwork_preview_worker_m2/handoff.md |
| 9bb755d3-adea-4487-91a0-1fdef200cc6d | Integrity Forensic Auditor | Forensic Integrity Audit | DONE | file:///c:/ryuka/lks-ai-2026/KOMUNITAS/backend/.agents/teamwork_preview_auditor_m4/handoff.md |
