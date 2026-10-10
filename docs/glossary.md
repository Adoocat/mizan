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
| Expected income | Beklenen gelir | A planned income item: what the month is planned against until the money is confirmed |
| Received (income) | Alındı | An income item confirmed with the amount that actually arrived, which is what the plan then counts |
| Unplanned income | Plansız gelir | Income recorded in a category no plan item accounts for |
| Allocated (A) | Dağıtılan | The sum of every line's planned amount |
| Available (line) | Kullanılabilir | planned + carry-in + moves in − moves out − actual |
| Covered by the pool | Havuzdan karşılanıyor | A flexible category with no line of its own; its spending counts on the pool |
| Covered by its parent | Üst kategoriden karşılanıyor | A subcategory with no line of its own; its spending counts on the parent's line |
| Rollover | Devretme | A flag on a line: its leftover stays with it next period instead of returning to the pool |
| Copy a month | Ayı kopyala | Fill a month's plan from an earlier one, leaving any amount already typed untouched |
| Overspend | Aşım | max(0, −Available(line)) |
| Cover | Karşıla | Move money from one line to another to cover an overspend |
| Goal contribution | Hedef katkısı | An earmark (or release) of money for a goal |
| Sinking fund | Birikim fonu | A goal for a known future expense, optionally repeating |
| Emergency fund | Acil durum fonu | Goal sized as months × essential monthly expenses |
| Opening balance | Açılış bakiyesi | What an account held when it was added, stored as a dated transaction, not a column |
| Derived balance | Türetilmiş bakiye | An account balance computed as the sum of its transaction lines; Mizan stores none |
| Transaction line | İşlem satırı | One signed movement on one account; several on one account are a split, two on different accounts a transfer |
| Reconcile | Mutabakat | Match an account against a statement; the difference is written as one adjustment |
| Adjustment | Düzeltme | The single transaction that makes a derived balance match a statement |
| Archive | Arşivle | Take an account, category or goal out of use while keeping its history |
| Category group | Kategori grubu | A group of categories with a kind the plan reasons about: income, essential, flexible, debt, savings, investment |
| Essential category | Zorunlu kategori | A category that counts towards essential monthly expenses, and so towards the emergency fund target |
| System key | Sistem anahtarı | The stable id of a seeded category, which is how the UI shows its name in both languages |
| Split | Bölünmüş işlem | One transaction whose amount is divided across several categories on the same account |
| Merge (categories) | Kategorileri birleştir | Move every line of one category onto another and archive the source |
| Needs review | İnceleme bekliyor | An on-budget expense or income line with no category yet |
| Soft delete | Yumuşak silme | Mark a transaction deleted (`deleted_at`) so it leaves every list but can be undone |
| Base amount | Ana para tutarı | A line’s amount in the workspace base currency, frozen at transaction time |
| Minor units | Alt birim | Decimal places of a currency (2 for TRY: kuruş) |
| Installment | Taksit | Credit-card purchase paid in monthly parts (v1.1) |
