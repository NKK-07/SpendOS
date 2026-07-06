# SpendOS Disaster Recovery & Incident Response Runbook (DR_RUNBOOK)

This runbook defines the official Disaster Recovery (DR), Business Continuity (BC), and Incident Response guidelines for the **SpendOS Monorepo** platform. It covers incident classification, database automated backup schedules, complete pg_dump/pg_restore guidelines, Redis cache fallbacks, and load-testing execution scripts.

---

## 1. Incident Severity & Classification Matrix

| Severity Level | Response SLA | Target MTTR | Description | Core Mitigation Action |
| :--- | :--- | :--- | :--- | :--- |
| **SEV 0 (Critical)** | **< 15 Mins** | **< 1 Hour** | Complete system outage, database corruption, or cross-tenant data leak. | Initiate SRE war room, restore from latest pg_dump, or revoke JWT secret credentials immediately. |
| **SEV 1 (Major)** | **< 30 Mins** | **< 4 Hours** | API degradation (e.g. Redis cache down), or individual integration queues stalled. | Verify degraded operation mode. Deploy SRE fixes or restart the outbox workers. |
| **SEV 2 (Minor)** | **< 4 Hours** | **< 24 Hours** | Dashboard styling discrepancies or non-blocking telemetry gaps. | SRE/Developer queue for regular sprint releases. |

---

## 2. PostgreSQL Backup & Disaster Recovery Playbooks

SpendOS runs on **PostgreSQL (Neon DB Serverless Cluster)** in production. SREs must maintain absolute zero-data-loss integrity for the corporate ledgers.

### 2.1 Automated Nightly Backup Cron Configuration
Automated backups are executed every 24 hours at `02:00 UTC` and written to encrypted AWS S3 storage.

```bash
# SRE Backup Script: backup-db.sh
#!/usr/bin/env bash
set -eo pipefail

BACKUP_DIR="/tmp/spendos_backups"
TIMESTAMP=$(date +%F_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/spendos_prod_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting PostgreSQL Backup..."
mkdir -p "${BACKUP_DIR}"

# Run pg_dump with custom compression directory format
pg_dump "${DATABASE_URL}" -F c -b -v -f "${BACKUP_FILE}"

echo "[$(date)] Syncing to Encrypted DR S3 Bucket..."
aws s3 cp "${BACKUP_FILE}" "s3://spendos-disaster-recovery/backups/spendos_prod_${TIMESTAMP}.sql.gz" --sse aws:kms

echo "[$(date)] DB Backup complete. Cleanup local storage..."
rm -f "${BACKUP_FILE}"
```

### 2.2 Manual Restoration Procedure
In the event of database corruption or hardware failure, follow this restoration script to restore the DB cluster:

```bash
# SRE Restoration Script: restore-db.sh
#!/usr/bin/env bash
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 <s3-backup-filename>"
  exit 1
fi

BACKUP_FILE=$1
LOCAL_FILE="/tmp/spendos_restore.sql.gz"

echo "[$(date)] Fetching backup file ${BACKUP_FILE} from S3..."
aws s3 cp "s3://spendos-disaster-recovery/backups/${BACKUP_FILE}" "${LOCAL_FILE}"

echo "[$(date)] Terminating all existing database sessions..."
psql "${DATABASE_URL}" -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE datname = current_database() AND pid <> pg_backend_pid();"

echo "[$(date)] Restoring DB schema and transaction tables..."
pg_restore --clean --no-owner --no-acl -h <neon-db-host> -U <neon-db-user> -d <neon-db-name> -v "${LOCAL_FILE}"

echo "[$(date)] Recovery check: Synced row counts:"
psql "${DATABASE_URL}" -c "SELECT COUNT(*) FROM \"expenses\";"

rm -f "${LOCAL_FILE}"
echo "[$(date)] Database Restoration Successful. Services are ready to boot."
```

---

## 3. Redis Cache Outage Failover Playbook

SpendOS uses a **Graceful Fail-Open** strategy for Redis cache outages to prevent entire dashboard lockups.

```
                  ┌──────────────────────┐
                  │   Incoming Request   │
                  └──────────┬───────────┘
                             │
                             ▼
                 [Is Redis Reachable?]
                 /                   \
               YES                    NO
               /                        \
              ▼                          ▼
      [Query Redis Cache]       [Log 'Pulse cache error']
      [Return 200 OK]           [Query PostgreSQL Direct]
                                [Return 200 Degraded OK]
```

### 3.1 SRE Verification Protocol
When an alert triggers indicating `redis_down`, execute these diagnostic commands on the production controller:
1. **Ping Redis**:
   ```bash
   redis-cli -h spendos-prod-redis.cache.amazonaws.com ping
   # Expected output: PONG
   ```
2. **Review API logs for fallbacks**:
   ```bash
   docker logs spendos-api | grep -i "pulse cache"
   # Expected output: "[Redis] Pulse cache eviction failed on approveExpense: Redis connection lost"
   ```
3. **Verify App Operability**:
   The app will automatically serve requests directly via Postgres database queries, and `/health` will return `200` with `status: "degraded"` and `redis: "down"`.

---

## 4. Load Testing Baseline Benchmarks

All pre-releases must meet load capacity requirements before launch. Load tests are written in **k6** and run against staging mock-environments.

### 4.1 k6 Load Test Configuration (`load-test.js`)
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },  // Ramp-up to 50 concurrent users
    { duration: '3m', target: 100 }, // Sustained load at 100 users
    { duration: '1m', target: 0 },   // Cool-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'], // 95% of requests must complete under 150ms
    http_req_failed: ['rate<0.01'],    // Error rate must be less than 1%
  },
};

export default function () {
  const params = {
    headers: {
      'Authorization': 'Bearer mock-admin-token',
      'Content-Type': 'application/json',
    },
  };

  // 1. Get Expenses list
  let res1 = http.get('http://localhost:3000/api/v1/expenses?take=20', params);
  check(res1, { 'status was 200': (r) => r.status === 200 });

  // 2. Query System Health
  let res2 = http.get('http://localhost:3000/health');
  check(res2, { 'health check succeeded': (r) => r.status === 200 });

  sleep(1);
}
```

### 4.2 Run Load Testing Suite
Execute k6 inside the CI/CD deployment verification pipeline:
```bash
k6 run load-test.js
```

---

## 5. disaster Recovery Runbook Consensus
Signed off and approved for the Controlled Production Beta release:
* **CTO Agent**: Approved
* **Security Engineer**: Approved
* **Principal Architect**: Approved
* **SRE Agent**: Approved
