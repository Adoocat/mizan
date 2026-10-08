-- Backfill: give every workspace that predates phase 5 the default category template.
--
-- New workspaces are seeded in code, inside the same transaction that creates them
-- (modules/categories/repository.ts). This covers the ones that already existed, and matches that
-- seed exactly: the structure comes from DEFAULT_CATEGORY_TEMPLATE and the names from
-- modules/categories/template.ts, written out here because a migration has to stand on its own.
--
-- Only workspaces with no groups at all are touched, so running it twice changes nothing.
WITH template (group_key, kind, group_sort, group_name, category_key, category_sort, category_name, is_essential) AS (
  VALUES
    ('income', 'income', 1, 'Income', 'salary', 1, 'Salary', false),
    ('income', 'income', 1, 'Income', 'freelance', 2, 'Freelance', false),
    ('income', 'income', 1, 'Income', 'otherIncome', 3, 'Other income', false),
    ('essentials', 'essential', 2, 'Essentials', 'rent', 1, 'Rent', true),
    ('essentials', 'essential', 2, 'Essentials', 'utilities', 2, 'Utilities', true),
    ('essentials', 'essential', 2, 'Essentials', 'internet', 3, 'Internet', true),
    ('essentials', 'essential', 2, 'Essentials', 'groceries', 4, 'Food & groceries', true),
    ('essentials', 'essential', 2, 'Essentials', 'transport', 5, 'Transport', true),
    ('essentials', 'essential', 2, 'Essentials', 'health', 6, 'Health', true),
    ('essentials', 'essential', 2, 'Essentials', 'insurance', 7, 'Insurance', true),
    ('flexible', 'flexible', 3, 'Flexible spending', 'diningOut', 1, 'Dining out', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'shopping', 2, 'Shopping', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'subscriptions', 3, 'Subscriptions', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'personalCare', 4, 'Personal care', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'entertainment', 5, 'Entertainment', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'education', 6, 'Education', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'gifts', 7, 'Gifts & donations', false),
    ('flexible', 'flexible', 3, 'Flexible spending', 'other', 8, 'Other', false),
    ('debt', 'debt', 4, 'Debt', 'cardPayment', 1, 'Card payment', false),
    ('debt', 'debt', 4, 'Debt', 'loanPayment', 2, 'Loan payment', false),
    ('savings', 'savings', 5, 'Savings', 'savingsTransfer', 1, 'Transfer to savings', false),
    ('investments', 'investment', 6, 'Investments', 'investmentContribution', 1, 'Investment contribution', false)
),
seeded AS (
  SELECT w."id"
  FROM "workspaces" w
  WHERE NOT EXISTS (SELECT 1 FROM "category_groups" g WHERE g."workspace_id" = w."id")
),
inserted_groups AS (
  INSERT INTO "category_groups" ("id", "workspace_id", "name", "kind", "system_key", "sort_order")
  SELECT gen_random_uuid(), s."id", g.group_name, g.kind, g.group_key, g.group_sort
  FROM seeded s
  CROSS JOIN (SELECT DISTINCT group_key, kind, group_sort, group_name FROM template) g
  RETURNING "id", "workspace_id", "system_key"
)
INSERT INTO "categories" ("id", "workspace_id", "group_id", "name", "system_key", "is_essential", "sort_order")
SELECT gen_random_uuid(), g."workspace_id", g."id", t.category_name, t.category_key, t.is_essential, t.category_sort
FROM inserted_groups g
JOIN template t ON t.group_key = g."system_key";
