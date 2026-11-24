process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://app:password@localhost:5432/monitor_server_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.SEED_DEMO_USER = 'true';
process.env.LOG_FILE = '';
process.env.SEED_DEMO_DATA = 'false';
process.env.SELF_LOG_ENABLED = 'true';
process.env.INGEST_RATE_LIMIT = '50';
