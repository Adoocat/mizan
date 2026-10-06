# Glossary (EN ↔ TR)

Definitions follow `docs/PLAN.md` (§9 goals, §10 budgeting rules, §11 recurring). Turkish terms are
the UI wording and may be refined as the Turkish copy is reviewed.

| English | Türkçe | Meaning |
|---|---|---|
| Workspace | Çalışma alanı | Owner of all financial data; one personal workspace per user in the MVP |
| Plan period | Plan dönemi | One budget month `[start, end)`, anchored to the workspace's start day (1–28) |
| Start day | Dönem başlangıç günü | Day of the month a plan period begins (default 1st) |
| Plan line | Plan kalemi | An allocation to a category, a goal, or the pool |
| Pool / Available to spend (ATS) | Harcanabilir | The free-spending line; covers flexible categories without their own line |
| Unassigned (U) | Dağıtılmamış | Income + pool carry-in − allocated. Aim is zero |
| Left to allocate | Dağıtılacak tutar | U when positive |
| Over-allocated | Fazla dağıtılmış | U when negative |
| Safe to spend today | Bugün güvenle harcanabilir | max(0, ATS excluding today's spending) ÷ days left including today |
| On-budget account | Bütçe içi hesap | An account whose transactions affect the plan |
| Carry-over | Devir | What happens to a line's leftover or overspend when a period closes |
| Overspend | Aşım | max(0, −Available(line)) |
| Cover | Karşıla | Move money from one line to another to cover an overspend |
| Goal contribution | Hedef katkısı | An earmark (or release) of money for a goal |
| Sinking fund | Birikim fonu | A goal for a known future expense, optionally repeating |
| Emergency fund | Acil durum fonu | Goal sized as months × essential monthly expenses |
| Minor units | Alt birim | Decimal places of a currency (2 for TRY: kuruş) |
| Installment | Taksit | Credit-card purchase paid in monthly parts (v1.1) |
