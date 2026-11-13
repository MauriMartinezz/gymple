-- Runs once, when the MySQL volume is created.
-- Disposable database for `pnpm test:integration`.
CREATE DATABASE IF NOT EXISTS gymple_test;
GRANT ALL PRIVILEGES ON gymple_test.* TO 'gymple'@'%';
