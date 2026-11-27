-- Compares ignoring case and accents, like MySQL's utf8mb4_0900_ai_ci did.
-- Used by the caseInsensitiveVarchar columns in schema.ts.
CREATE COLLATION IF NOT EXISTS "case_insensitive" (provider = icu, locale = 'und-u-ks-level1', deterministic = false);
