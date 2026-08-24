# IHMS Database Backup & Disaster Recovery Guide

This guide details the database backup, verification, scheduled automation, and recovery procedures for the **Integrated Hostel Management System (IHMS)** Enterprise ERP.

---

## 1. Overview & Architecture

IHMS uses a multi-tenant relational data schema. Backups capture all essential business tables into structured, timestamped snapshots containing both entity schemas and relationship graphs:

- **Organizations & Hostels**: Multi-branch properties, facilities, capacities.
- **Access & RBAC**: Users, Owners, Staff roles, Password hashes, Security records.
- **Hostel Infrastructure**: Rooms, Bed inventories, Room allocations, Transfers.
- **Students & Portal**: Student records, KYC details, Portal access credentials.
- **Financial Master**: Fee structures, Fee accounts, Demand invoices, Installments.
- **Transactions & Ledger**: Payments, Immutable Double-Entry Ledgers, Accounting Vouchers, Receipts, Sequences.
- **Operations**: Complaints, Announcements, Notifications, Visitors, Mess menus, Assets, Audit logs.

---

## 2. Backup Strategy

| Backup Type | Frequency | Target Retention | Trigger Method |
| :--- | :--- | :--- | :--- |
| **Full Database Snapshot** | Daily / On-Demand | 30 Days | Manual or Cron / Scheduled task |
| **Pre-Deployment / Pre-Migration** | Before Schema Changes | Indefinite | Manual script `npm run db:backup` |
| **Transaction Logs / Webhooks** | Real-time | Continuous | App-level `payment_webhook_events` & `audit_logs` |

---

## 3. Manual Backup Execution

To run an instant, manual full database backup from the root project directory:

```bash
npm run db:backup
```

*(Or inside the `backend` workspace: `npm run db:backup`)*

### Output:
- Creates a timestamped snapshot file: `backups/ihms-backup-YYYY-MM-DDTHH-mm-ss-SSSZ.json`
- Prints total tables, record count per table, and total archive file size.

---

## 4. Manual Restore Procedure

To restore the database from the **latest** available backup:

```bash
npm run db:restore
```

To restore from a **specific** timestamped backup file:

```bash
npm --workspace=backend run db:restore -- backups/ihms-backup-2026-08-24T12-00-00-000Z.json
```

### Safety & Integrity Guarantees:
1. **Atomic Transaction**: The restore executes inside a single database transaction (`BEGIN ... COMMIT`). If any table fails, all changes are rolled back (`ROLLBACK`).
2. **Upsert Logic (`ON CONFLICT DO UPDATE`)**: Records are reconciled using primary keys without violating foreign key constraints.
3. **Audit Verification**: Record counts and table tallies are displayed upon completion.

---

## 5. Production Automated Scheduled Backups

### Linux / Docker Deployment (Cron)
Add a cron job to execute daily backups at 02:00 AM:

```bash
0 2 * * * cd /path/to/ihms && npm run db:backup >> /var/log/ihms-backup.log 2>&1
```

### Windows Deployment (Task Scheduler)
Create a scheduled task running:
```powershell
powershell -Command "cd C:\Users\Soujanya Bandari\Desktop\ihms; npm run db:backup"
```

### PostgreSQL Native Tools (`pg_dump` / `pg_restore`)
When connected to a dedicated PostgreSQL or cloud database (AWS RDS / GCP Cloud SQL / Supabase / Neon):

```bash
# Export schema and data:
pg_dump -U postgres -h localhost -p 5432 -d ihms_db -F c -b -v -f backups/ihms_db_dump.pgdump

# Restore dump:
pg_restore -U postgres -h localhost -p 5432 -d ihms_db -v -c backups/ihms_db_dump.pgdump
```

---

## 6. Security Best Practices

- **Never Commit Backups to Version Control**: The `backups/` directory is excluded in `.gitignore`.
- **Environment Variables**: Database credentials (`DATABASE_URL`, `DB_PASSWORD`, `JWT_SECRET`) must be stored in `.env` and never hardcoded in source files.
- **Offsite Redundancy**: In production environments, synchronize the `backups/` directory with encrypted cloud object storage (e.g. AWS S3 with KMS or Google Cloud Storage).
