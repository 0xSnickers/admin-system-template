-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "app_key" VARCHAR(64) NOT NULL,
    "description" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "referrer" VARCHAR(2048) NOT NULL DEFAULT '',
    "visitor_id" VARCHAR(64) NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64),
    "ip" VARCHAR(64) NOT NULL,
    "browser" VARCHAR(30) NOT NULL,
    "os" VARCHAR(30) NOT NULL,
    "device" VARCHAR(20) NOT NULL,
    "release" VARCHAR(64),
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(512) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_seen" TIMESTAMPTZ(3) NOT NULL,
    "last_seen" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "error_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "stack" TEXT NOT NULL DEFAULT '',
    "url" VARCHAR(2048) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "visitor_id" VARCHAR(64) NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64),
    "ip" VARCHAR(64) NOT NULL,
    "browser" VARCHAR(30) NOT NULL,
    "os" VARCHAR(30) NOT NULL,
    "device" VARCHAR(20) NOT NULL,
    "release" VARCHAR(64),
    "breadcrumbs" JSONB NOT NULL DEFAULT '[]',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "service" VARCHAR(50) NOT NULL,
    "level" VARCHAR(10) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "request_id" VARCHAR(64),
    "method" VARCHAR(10),
    "path" VARCHAR(512),
    "status" INTEGER,
    "duration_ms" INTEGER,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_rules" (
    "id" UUID NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "note" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_app_key_key" ON "projects"("app_key");

-- CreateIndex
CREATE INDEX "events_project_id_type_created_at_idx" ON "events"("project_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE INDEX "events_ip_idx" ON "events"("ip");

-- CreateIndex
CREATE INDEX "error_issues_project_id_last_seen_idx" ON "error_issues"("project_id", "last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "error_issues_project_id_fingerprint_key" ON "error_issues"("project_id", "fingerprint");

-- CreateIndex
CREATE INDEX "error_events_issue_id_created_at_idx" ON "error_events"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "error_events_project_id_created_at_idx" ON "error_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "error_events_ip_idx" ON "error_events"("ip");

-- CreateIndex
CREATE INDEX "server_logs_created_at_idx" ON "server_logs"("created_at");

-- CreateIndex
CREATE INDEX "server_logs_project_id_created_at_idx" ON "server_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "server_logs_service_created_at_idx" ON "server_logs"("service", "created_at");

-- CreateIndex
CREATE INDEX "server_logs_ip_idx" ON "server_logs"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "ip_rules_ip_key" ON "ip_rules"("ip");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_issues" ADD CONSTRAINT "error_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "error_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_logs" ADD CONSTRAINT "server_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
