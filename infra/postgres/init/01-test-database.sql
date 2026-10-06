-- A separate database for running the API against by hand in test mode.
-- Automated integration and E2E tests use Testcontainers instead.
CREATE DATABASE mizan_test OWNER mizan;
