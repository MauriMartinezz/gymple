-- Runs once, when the Postgres volume is created, and on `pnpm db:test:create`.
-- Disposable database for `pnpm test:integration`, owned by the app user.
-- Postgres has no CREATE DATABASE IF NOT EXISTS; \gexec runs it only when missing.
SELECT 'CREATE DATABASE gymple_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gymple_test')\gexec
