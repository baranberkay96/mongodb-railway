# MongoDB 8 Replica Set (Prisma-Ready) with Backups: Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **MongoDB 8 Replica Set (Prisma-Ready) with Backups** (49 chars; `8` = the MongoDB major of the pinned `mongo:8.0.34` image) |
| Description | Single-node replica set for transactions and change streams, with backups. (74 chars) |
| Category | Storage |
| Tags | mongodb, mongo, replica-set, prisma, transactions, change-streams, nosql, backups |
| Icon | `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/mongodb.svg` (200, image/svg+xml) |
| Repo | `baranberkay96/mongodb-railway`, root directories `/services/mongodb` and `/services/backup` |

The listing is delivered as written:

- **"Replica set"**: `rs0`, initiated automatically on the first boot.
- **"Prisma-Ready"**: Prisma ORM 6.x's MongoDB connector requires a replica set. Prisma ORM 8's early-access MongoDB library requires MongoDB 8.0 or newer. `DATABASE_URL` carries the database name Prisma needs. Prisma ORM 7 does not support MongoDB according to Prisma's docs; the README says so.
- **"transactions and change streams"**: both work on a single-member replica set.
- **"backups"**: the daily `mongodump --oplog` cron job to a Railway Bucket.

## Base market templates (public API, 2026-10-31)

| Market template | Topology | Kept | Problems fixed |
|---|---|---|---|
| `mongo` "MongoDB" (Railway's own; 29,004 active, 2,565 deploys in 30 days) | one service, image `mongo:8.0` (floating), start command `docker-entrypoint.sh mongod --ipv6 --bind_ip ::,0.0.0.0 --setParameter diagnosticDataCollectionEnabled=false`, volume `/data/db` | **Base for the variable contract**: service name `MongoDB`, `MONGOHOST`/`MONGOPORT`/`MONGOUSER`/`MONGOPASSWORD`/`MONGO_URL`/`MONGO_INITDB_ROOT_*`, generated letters-only password, user `mongo`, dual-stack bind, FTDC off | **Standalone**: transactions, change streams and Prisma fail. Floating tag. WiredTiger cache from the default formula on whatever memory mongod detects. No backups beyond volume snapshots. No `MONGO_PUBLIC_URL` variable in the template config. On Linux 6.19.0–7.0.13 the plain 8.0.34 image stops at startup (SERVER-121912) |
| `mongo-ha` "Mongo HA" (Railway's own; 272 deploys in 30 days) | 3 members (`ghcr.io/railwayapp-templates/mongo-ha/mongo:8.0`, Rust supervisor) + 2 HAProxy replicas; `directConnection=true` through HAProxy; volume backup schedules | Ideas only (no license): kernel workaround, FCV note, standalone caveat, `directConnection=true` for the public URL | Right product for failover. It costs ≥ 3× the RAM of a single node, and it is not a drop-in for apps that want one small database |
| `dxhww9` "MongoDB Single Replica" (30 active) | repo `railwayapp-templates/mongo-replica-set` (MIT): `mongo:7` + keyfile script, plus a separate "Init Single Replica" service | The idea of a single-node set with a keyFile | MongoDB 7. The init service has to be deleted by hand. `MONGO_URL` and `MONGOHOST` point at the **public** TCP proxy (egress-billed) with `retryWrites=false`. The keyfile is written once and never updated. No backups. Unpinned repo |
| `mongodb-community-server-replica-set` (5 active) | 3 members + init service from `contourkde/mongodb_replicaset` (8.2.4) | Nothing beyond the above | 8.2, whose minor-release line is no longer patched. Public `MONGO_URL`. `MONGODB_INITDB_*` variable names (not the image's `MONGO_INITDB_*`). An init service to delete. No backups |

Upstream used for everything else: `docker-library/mongo` (`8.0/Dockerfile`, `8.0/docker-entrypoint.sh`, `versions.json`), `mongodb/mongo` at `r8.0.34`, `mongodb/mongo-tools` at `100.20.0`, `mongodb-js/mongosh`, and the MongoDB, Prisma and Railway docs. The full list is in NOTICE.md. No market README text was reused.

## Version choice: 8.0.34, not 8.3, 8.2 or 9.0

| Line | Status on 2026-10-31 (docker-library `versions.json`, MongoDB versioning docs) | Decision |
|---|---|---|
| **8.0.34** (release notes: 2026-10-13) | **Major release**, 5-year lifecycle, EOL **2029-10-31**. Patch releases continue (8.0.30, 8.0.32 and 8.0.34 list CVE fixes) | **Pinned.** Same series as Railway's `mongo` and `mongo-ha` templates (Prisma ORM 8 needs at least 8.0). Upgrade path to 9.0 is direct |
| 8.2 | **Minor release**; docker-library has dropped it (`"8.2": null`). Minor releases are "patched only until the next minor is released" | Not an option: no longer patched |
| 8.3.13 | Newest 8.x minor. Patched only until the next minor; 9.0 is already out, so 8.3 should not be expected to get more 8.x patches. Upgrades must go 8.3 → 9.0 | Rejected: shorter support than 8.0 and no feature the listing needs |
| 9.0.4 | New major (2026-09-30) | Out of scope for a "MongoDB 8" listing. Documented as the upgrade path (README) |

## Pinned versions

| Service | Image / build | Version | Released | Checked |
|---|---|---|---|---|
| MongoDB | repo `/services/mongodb`, `FROM mongo:8.0.34-noble@sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399` | MongoDB Community Server 8.0.34; mongosh 2.x; Ubuntu 24.04 | image built 2026-10-26 | 2026-10-31 |
| MongoDB Backup | repo `/services/backup`, same `mongo` digest + `rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5` | Database Tools 100.x (100.20.0 was the newest in MongoDB's apt repo); rclone 1.75.2 | rclone 2026-10-09 | 2026-10-31 |

The digest pins the multi-arch index (amd64 + arm64). It does not include the windows images that share the plain `8.0.34` tag.

## Architecture

```
 Apps on Railway ── MONGO_URL / DATABASE_URL (replicaSet=rs0) ──► MongoDB :27017 (private, [::] + 0.0.0.0)
                                                                   mongod 8.0.34 --replSet rs0 --keyFile --auth
 Your machine ── MONGO_PUBLIC_URL (directConnection=true) ──► TCP proxy ─┘   volume /data/db
                                                                   ▲
 MongoDB Backup (cron 03:15 UTC) ── mongodump --archive --gzip --oplog ─┘
        │ rclone rcat (stream, no temp files)
        ▼
 Bucket: mongodb/{UTC timestamp}/mongodb.archive.gz, MANIFEST.txt
```

## Services

### MongoDB

| Setting | Value |
|---|---|
| Source | repo `baranberkay96/mongodb-railway`, root `/services/mongodb` (Dockerfile `FROM` the official image + 3 small files) |
| Start command | none: ENTRYPOINT `mongodb-railway-start`, which execs the official `docker-entrypoint.sh mongod …` |
| Volume | `/data/db` (Railway's MongoDB path) |
| Networking | private `mongodb.railway.internal:27017`, **TCP proxy on 27017** for `MONGO_PUBLIC_URL`; no HTTP domain |
| Healthcheck | none. Railway healthchecks are HTTP-only, and mongod speaks the wire protocol. The deployment is live once the container runs; readiness is the log line `[mongodb-rs-init] replica set rs0 ready: PRIMARY …` |
| Restart | ALWAYS (`restartPolicyMaxRetries` omitted) |
| Draining | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` (clean checkpoint on redeploy) |

Boot sequence (`services/mongodb/mongodb-railway-start`, root, then the official entrypoint):

1. **Validates** every variable. A bad value stops the service with exit 78 and names the variable. Checks:
   - non-empty user;
   - password of at least 12 characters;
   - replica-set name `[A-Za-z0-9_-]`;
   - keyFile 6–1024 base64 characters;
   - member host `{hostname}:27017`;
   - number ranges.

   It warns when the user or password contains characters that would need URL encoding.
2. **keyFile**: `MONGO_REPLICA_SET_KEY` is written at every boot to `/etc/mongodb-railway/keyfile`, mode 0400, owner `mongodb`, in a 0700 directory. It stays off the volume, so changing the variable changes the key.
3. **Self-resolution**: appends `127.0.0.1 {member host}` to `/etc/hosts` unless the entry already exists. Railway registers a deployment's private DNS name only after the deployment is up (Rule 8.13). A replica-set member whose host does not resolve to itself at startup stays REMOVED: MongoDB only re-checks on a heartbeat from another member (`jstests/replsets/isself_failure_restart.js`), and a single-node set has none. Other services still resolve the name through Railway DNS. If `/etc/hosts` is read-only, the reconciler repairs a REMOVED member once DNS resolves (step 7).
4. **Cache**: the budget is `MONGO_MEMORY_LIMIT_MB`, otherwise the cgroup v2 or v1 limit bounded by `MemTotal` and capped at 8192 MB. The cache is `max(0.25 GB, (budget − 1 GB) / 2)`, MongoDB's own default formula applied to the budget. `MONGO_CACHE_SIZE_GB` overrides it.
5. **Oplog**: `--oplogSize` = 5% of the volume (`df`), clamped to 128–2048 MB, or `MONGO_OPLOG_SIZE_MB`. MongoDB applies it only when the oplog is created, at the first initiate. MongoDB's own default is 5% of free disk with a 990 MB minimum and a 50 GB maximum, which can be most of a 5 GB Hobby volume, or more than a 0.5 GB Trial volume.
6. **Kernel guard**: mongod 8.0.34 exits on Linux 6.19.0–7.0.13 while TCMalloc per-CPU caches are active (`startup_check_rseq.cpp`, SERVER-121912). On those kernels the wrapper sets `glibc.pthread.rseq=1` in `GLIBC_TUNABLES`, keeping any other tunables. glibc then keeps rseq, so the caches are off and mongod starts. `MONGO_RSEQ_WORKAROUND=auto|on|off`.
7. **Volume lock**: `flock` on `/data/db/.railway-mongodb.lock`, held by mongod for its lifetime (fd 9). An overlapping deployment waits, logging every 30 s; after 600 s mongod's own lock decides.
8. **Reconciler**: starts `mongodb-rs-init` in the background. It is double-forked so PID 1 reaps it, and it does not hold the lock. It runs `rs-step.js` with mongosh every 2–10 s until the member is PRIMARY. Credentials come from the environment and never appear in argv. Each step:
   - initiates `rs0` with `{_id: 0, host: {member host}}` when the node reports NotYetInitialized (94);
   - waits while the entrypoint's temporary first-boot instance runs (NoReplicationEnabled, 76);
   - force-reconfigures a REMOVED member (93 or state 10);
   - reconfigures the member host when the service's private hostname changes (normal reconfig on a primary, forced otherwise);
   - resizes an existing oplog to an explicit `MONGO_OPLOG_SIZE_MB` ≥ 990;
   - leaves sets with more than one member alone.

   On auth failure it keeps retrying (every 60 s after a 3-minute first-boot grace) and logs an actionable error. mongosh's home is a temporary directory, so no mongosh logs land on the volume.
9. Removes `MONGO_REPLICA_SET_KEY`, `MONGOPASSWORD` and the URL variables from the environment, then execs `docker-entrypoint.sh mongod --port 27017 --ipv6 --bind_ip ::,0.0.0.0 --replSet rs0 --keyFile … --wiredTigerCacheSizeGB … --oplogSize … --setParameter diagnosticDataCollectionEnabled=false {MONGOD_EXTRA_ARGS}`. On the first boot the official entrypoint starts a temporary instance without `--replSet`, `--keyFile` and `--auth`, bound to 127.0.0.1. It creates the root user from `MONGO_INITDB_ROOT_*`, then execs the real mongod as `mongodb` with `--auth`.

Variables beyond Railway's MongoDB (all have defaults; none is required input):

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_REPLICA_SET_NAME` | `rs0` | Set name, fixed after the first boot |
| `MONGO_REPLICA_SET_KEY` | `secret(64, [A-Za-z0-9])` | keyFile content |
| `MONGO_REPLICA_SET_HOST` | `${{RAILWAY_PRIVATE_DOMAIN}}:27017` | Member host stored in the config |
| `MONGO_DATABASE` | `railway` | Database in `DATABASE_URL` / `DATABASE_PUBLIC_URL` |
| `MONGO_PUBLIC_URL`, `DATABASE_URL`, `DATABASE_PUBLIC_URL` | see README | External access and Prisma |
| `MONGO_MEMORY_LIMIT_MB`, `MONGO_CACHE_SIZE_GB`, `MONGO_OPLOG_SIZE_MB` | `auto` | Sizing overrides |
| `MONGO_SELF_RESOLVE` | `hosts` | `dns` = no hosts entry |
| `MONGO_RSEQ_WORKAROUND` | `auto` | Kernel guard |
| `MONGO_FTDC_ENABLED` | `false` | Diagnostic data capture, as Railway's MongoDB |
| `MONGOD_EXTRA_ARGS` | empty | Extra flags |

### MongoDB Backup

| Setting | Value |
|---|---|
| Source | repo `baranberkay96/mongodb-railway`, root `/services/backup` (same `mongo` digest, so tools match the server; static rclone; runs as uid 999) |
| Cron | `15 3 * * *` (daily 03:15 UTC; Railway skips a run while the previous one is active) |
| Restart | NEVER (each run exits; failures show as failed cron runs) |
| Volume / networking | none |

Each run (`services/backup/mongodb-backup`):

1. **Validates settings.** It writes the connection string to a 0600 YAML file for Database Tools' `--config`, so the password never appears in argv. It then waits up to `BACKUP_WAIT_SECONDS` for a writable primary of a replica set (`primary.js`), not just an open port.
2. **Dumps.** `mongodump --archive --gzip --oplog` (all databases, users and roles, a point-in-time-consistent dump) streams straight into `rclone rcat` → `{BACKUP_PREFIX}/{UTC timestamp}/mongodb.archive.gz`. Nothing touches local disk. `--oplog` fails if a `renameCollection`, `$out`, `mapReduce` or a user/role change runs during the dump, so the dump is retried up to `BACKUP_ATTEMPTS` (2) times.
3. **Verifies.** `full` (default) re-reads the whole object through `gzip -t`. Both modes run `mongorestore --archive --gzip --dryRun --oplogReplay`, which reads the archive header and namespace list and checks that the oplog is present. `MANIFEST.txt` (run, bytes, replica set, server and mongodump versions, oplog flag) is written last; a run without it is incomplete.
4. **Retention.** Complete runs older than `BACKUP_RETENTION_DAYS` (14) are deleted, but the newest `BACKUP_KEEP_MIN` (3) are always kept. Incomplete runs older than 2 days are deleted. Unrelated folders are ignored. A failed run deletes nothing.
5. **One-shot restore.** With `BACKUP_RESTORE_RUN={run}`, the job instead restores that complete run into `MONGO_URL`:
   - `mongorestore --drop --stopOnError --oplogReplay`, excluding `admin.system.users` and `admin.system.roles` unless `BACKUP_RESTORE_USERS=true`;
   - writes `RESTORED.txt` next to the run and exits;
   - later runs see the marker, warn and back up normally;
   - the restored run is protected from pruning while the variable is set.

   `mongodb-backup list` and `mongodb-backup restore {run}` exist for manual use.

### Bucket

Railway Bucket named `Bucket` (private, S3-compatible, virtual-hosted URLs). The backup job references `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`. Buckets have no lifecycle rules, so retention lives in the job.

## Connecting

| From | Variable | Notes |
|---|---|---|
| Railway services (drivers, Mongoose) | `${{MongoDB.MONGO_URL}}` = `mongodb://mongo:…@mongodb.railway.internal:27017/?replicaSet=rs0&authSource=admin` | Discovers the set; transactions and change streams work. To add a database name, put it before `?` (do not append to the end) |
| Railway services (Prisma) | `${{MongoDB.DATABASE_URL}}` = `…:27017/railway?replicaSet=rs0&authSource=admin` | Prisma's `env("DATABASE_URL")` |
| Outside Railway | `MONGO_PUBLIC_URL` / `DATABASE_PUBLIC_URL` = `…@{proxy}:{port}/?directConnection=true&authSource=admin` | Required because the member host only resolves inside Railway; no TLS; egress-billed |

The TCP proxy is on by default because `MONGO_PUBLIC_URL` is part of the requested contract and of Railway's MongoDB. It accepts only SCRAM logins with the 32-character generated password. To keep the database private, delete the proxy under MongoDB → Settings → Networking. TLS for the proxy was not added this round; see Open questions.

## Restore

- From the Bucket: download `mongodb/{run}/mongodb.archive.gz`, then run `mongorestore --uri "{MONGO_PUBLIC_URL}" --gzip --archive=mongodb.archive.gz --oplogReplay --drop --nsExclude "admin.system.users" --nsExclude "admin.system.roles"`. Use Database Tools 100.x; a matching version is best.
- Inside Railway: set `BACKUP_RESTORE_RUN` on MongoDB Backup, run `railway cron run --service "MongoDB Backup"`, then clear the variable.
- `--drop` replaces the collections in the archive and leaves others alone. Excluding users and roles keeps the current root password valid. With `BACKUP_RESTORE_USERS=true`, the archived users replace the current ones, and `MONGO_INITDB_ROOT_PASSWORD` must then be set to the archived password.
- Railway's own volume backups (MongoDB → Backups) are complementary. Enable them in the dashboard if you want snapshot restores as well.

## Required input

None. Every credential is generated with `secret()` or referenced, and the Bucket is created by the template.

## First connection

1. MongoDB logs show:
   - `[mongodb-railway] … WiredTiger cache … rseq workaround …`;
   - the entrypoint's `MongoDB init process complete`;
   - `[mongodb-rs-init] initiated replica set rs0 with member mongodb.railway.internal:27017`;
   - `… ready: PRIMARY …`.
2. `mongosh "{MONGO_PUBLIC_URL}"` → `rs.status().members[0].stateStr` = `PRIMARY`, `rs.conf().members[0].host` = `mongodb.railway.internal:27017`.
3. In your app service: `MONGO_URL=${{MongoDB.MONGO_URL}}` or `DATABASE_URL=${{MongoDB.DATABASE_URL}}`.

## Improvements over market templates

1. **Replica set in one service, from the first boot, idempotent.** No init service to delete (`dxhww9`, `mongodb-community-server-replica-set`). Initiation happens only on NotYetInitialized, never twice.
2. **Private `MONGO_URL` with `replicaSet=rs0&authSource=admin`.** `dxhww9` and the community template route `MONGO_URL` through the public, egress-billed proxy.
3. **Drop-in with Railway's `mongo`.** Same service name, variable names and defaults. Adds `MONGO_PUBLIC_URL` and the Prisma-style `DATABASE_URL`/`DATABASE_PUBLIC_URL`.
4. **Member host = private domain, robust at boot.** The hosts entry avoids the REMOVED state caused by Railway's late DNS registration. A REMOVED member is repaired, and the member follows a change of the service's private hostname.
5. **Kernel guard for SERVER-121912.** Without it, 8.0.34 refuses to start on Linux 6.19.0–7.0.13.
6. **Memory-aware WiredTiger cache** (container limit, 8 GB auto cap, overrides) and **volume-aware oplog** (128–2048 MB instead of MongoDB's 990 MB to 50 GB).
7. **Daily verified backups** to a Railway Bucket: point-in-time-consistent `--oplog` archive, gzip, full read-back check, manifest, age + minimum-count retention, guarded one-shot restore. No market template backs up to object storage.
8. **Safety.** Strict input validation with clear errors. keyFile is 0400, owned by `mongodb`, off the volume. Secrets stay out of argv and out of mongod's environment. A volume lock prevents overlapping deployments. The backup runs as non-root.
9. **Pinned images** by tag and digest (market: floating `mongo:8.0`, `mongo:7`, unpinned repos). Every variable has a description.

## Resource estimate

Railway prices: RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month, Bucket $0.015/GB-month, egress $0.05/GB (uploads to a Bucket count as service egress). These are estimates, not measurements.

| Service | Idle RAM / CPU | Typical RAM / CPU | Notes |
|---|---|---|---|
| MongoDB | 0.2 GB / 0.02 | 1.0 GB / 0.15 | A replica set writes a no-op to the oplog every 10 s and checkpoints every 60 s. The cache fills only with data that is read |
| MongoDB Backup | 0 between runs | ~0.2 GB / 0.5 vCPU for a minute or two a day | < $0.10/month |
| Volume | 0.3 GB | 5 GB | Hobby volumes start at 5 GB, Pro at 50 GB |
| Bucket | ~0 | ~4 GB (14 daily archives of ~0.3 GB) | + ~9 GB/month upload egress |

Estimated monthly cost:

- **Idle ≈ $2.5**: 0.2 GB × $10 + 0.02 vCPU × $20 + 0.3 GB × $0.15.
- **Typical ≈ $14.5**: 1.0 GB × $10 + 0.16 vCPU × $20 + 5 GB × $0.15 + 4 GB × $0.015 + 9 GB × $0.05.
- **Busy** (4 GB RAM, 1 vCPU, 30 GB volume, 3 GB archives) ≈ $70.

Railway's Mongo HA runs three members plus two HAProxy replicas, so it costs roughly 3–4× this template's idle and typical figures.

Minimum plan:

- **Trial** boots it (1 GB RAM → 0.25 GB cache, 0.5 GB volume → 128 MB oplog), if Buckets are available on the account.
- **Hobby** is recommended for real data.

## Verification checklist

Static checks done this round: see `_reports/round7/88-mongodb.md`. On the first Railway deploy:

- [ ] Both services build; the Dockerfile `RUN` checks print `db version v8.0.34`, the mongosh, mongodump and rclone versions.
- [ ] MongoDB logs:
  - the wrapper's two lines (record the kernel, rseq state, cache budget source and whether self-resolution says `hosts (… -> 127.0.0.1 …)` or `dns (… read-only …)`);
  - `MongoDB init process complete`;
  - `initiated replica set rs0 …`;
  - `ready: PRIMARY mongodb.railway.internal:27017`.
- [ ] `mongosh "{MONGO_PUBLIC_URL}"`:
  - `rs.status()` shows PRIMARY;
  - `db.adminCommand({getCmdLineOpts: 1}).parsed` shows replication `rs0`, `security.keyFile` and the cache size;
  - `db.serverStatus().wiredTiger.cache["maximum bytes configured"]` matches the log;
  - `db.getSiblingDB("local").oplog.rs.stats().maxSize` matches the oplog line.
- [ ] Transaction:

  ```js
  s = db.getMongo().startSession();
  s.startTransaction();
  s.getDatabase("railway").t.insertOne({a: 1});
  s.commitTransaction();
  ```

- [ ] Change stream: `db.t.watch()` in one shell, an insert in another → event received.
- [ ] Prisma 6.19: `prisma db push` with `DATABASE_PUBLIC_URL`, then a nested create (uses a transaction) succeeds.
- [ ] From another Railway service: `mongosh "$MONGO_URL" --eval 'db.hello().isWritablePrimary'` → true (exercises replica-set discovery over the private network).
- [ ] Redeploy MongoDB: it comes back PRIMARY with no `initiated` line (already initiated) and no REMOVED, and the data is still there.
- [ ] `railway cron run --service "MongoDB Backup"` → run exits 0. The Bucket has `mongodb/{ts}/mongodb.archive.gz` and `MANIFEST.txt` (`oplog=true`). The log shows `verified (full)`.
- [ ] Restore drill: set `BACKUP_RESTORE_RUN={ts}`, run the job → `restore of run … complete`, `RESTORED.txt` exists. Run again → warning plus a normal backup.
- [ ] Optional: change the private hostname (Settings → Networking) → the log shows `member host changed …` or a REMOVED repair, then PRIMARY under the new name.

## Open questions

- **Build not run** (no Docker this round). Risks are low: `FROM` a pinned digest, `COPY --chmod` (BuildKit, used by published templates here), one `RUN` check. The base images declare `VOLUME /data/db /data/configdb` in their config. Rule 8.17 concerns a `VOLUME` instruction in our Dockerfile, which has none, and other published templates here build `FROM` images with inherited volumes.
- **`/etc/hosts` writability on Railway** is unverified. If it is read-only, boot still works: the first initiate waits for DNS, and after a redeploy the member is REMOVED until DNS resolves, then force-reconfigured by the reconciler. Record which path the log shows.
- **mongosh script behaviour** was tested only against a mock of the shell API (Node VM). Unverified in the real shell: `connect()` with credentials in the URI, `runCommand` throwing or returning `ok: 0` (both handled), `process.env`, `quit(code)` exit codes, mongosh's implicit await inside helper functions.
- **Kernel range**: which kernels Railway hosts run is unknown. With the workaround active, TCMalloc per-CPU caches are off, which upstream says can cost some allocator performance.
- **Volume size from `df`**: auto oplog sizing assumes `df` reports the volume's own size. The log line shows the value; set `MONGO_OPLOG_SIZE_MB` if it looks wrong.
- **Railway Data tab** for a repo-built service: the `MONGO*` variables it may read are set, but whether the tab appears was not checked.
- **TLS** on the public proxy is not provided. It would need a certificate generated at boot plus `tlsMode preferTLS` and `tlsAllowConnectionsWithoutCertificates`; that is a candidate for a later round after a deploy test.
- **Large or busy databases**: `--oplog` needs the oplog to cover the dump's duration. On write-heavy data, raise `MONGO_OPLOG_SIZE_MB` (≥ 990 resizes live) or set `BACKUP_OPLOG=false`. Dumps stream in 16 MiB parts, up to ~150 GiB per archive.
- **Prisma 6 with MongoDB 8.0**: Prisma's v6 docs do not list supported MongoDB server versions. It works in practice with replica sets, but this was not tested here.
- **Buckets on Trial accounts** are unconfirmed.
