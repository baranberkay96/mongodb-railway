# Deploy and Host MongoDB with Railway

MongoDB 8.0 Community Server as a single-node replica set, ready for Prisma, multi-document transactions and change streams. Root user, keyFile and replica set are set up automatically on the first boot, and a daily job stores consistent dumps in a Railway Bucket with retention. Community template, not affiliated with MongoDB, Inc.

## About Hosting MongoDB

A standalone `mongod` rejects transactions and change streams, so Prisma's MongoDB connector, Mongoose sessions and `watch()` fail on it. This template runs the official `mongo:8.0.34` image as replica set `rs0` with one member. On the first boot it creates the root user, writes the keyFile from a generated secret and initiates the set with the service's private hostname. It keeps that hostname in sync, sizes the WiredTiger cache from the container's memory limit and listens on IPv4 and IPv6. Connection variables use the same names as Railway's MongoDB, and a cron job backs everything up to a Bucket.

## Common Use Cases

- Prisma ORM projects on MongoDB, which require a replica set
- Apps that need multi-document ACID transactions (orders, payments, inventory)
- Real-time features built on change streams: notifications, cache invalidation, sync and audit trails
- A drop-in replacement for a standalone Railway MongoDB, with daily backups to a Bucket

## Dependencies for MongoDB Hosting

- MongoDB Community Server 8.0.34 (official Docker image)
- A Railway volume for `/data/db`
- A Railway Bucket for the backups (created by the template)

### Deployment Dependencies

- MongoDB Docker image: https://hub.docker.com/_/mongo
- Replica set deployment: https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/
- Transactions: https://www.mongodb.com/docs/manual/core/transactions/
- Change streams: https://www.mongodb.com/docs/manual/changeStreams/
- Prisma and MongoDB: https://www.prisma.io/docs/orm/overview/databases/mongodb
- mongodump and mongorestore: https://www.mongodb.com/docs/database-tools/
- Railway Buckets: https://docs.railway.com/storage-buckets

### Implementation Details

| Service | What it does | Network |
|---|---|---|
| **MongoDB** | `mongod` 8.0.34, replica set `rs0`, auth + keyFile, volume `/data/db` | private `mongodb.railway.internal:27017`, TCP proxy for external clients |
| **MongoDB Backup** | Cron job, daily 03:15 UTC: `mongodump --archive --gzip --oplog` to the Bucket, verified, 14-day retention (at least 3 runs kept) | private only |
| **Bucket** | Railway Bucket that stores `mongodb/{UTC timestamp}/mongodb.archive.gz` and `MANIFEST.txt` | S3 |

**Connect from another Railway service** (add a variable that references this one):

| Variable on your app | Value | Use |
|---|---|---|
| `MONGO_URL` | `${{MongoDB.MONGO_URL}}` | Drivers and Mongoose: `mongodb://…@mongodb.railway.internal:27017/?replicaSet=rs0&authSource=admin` |
| `DATABASE_URL` | `${{MongoDB.DATABASE_URL}}` | Prisma: the same URL with the database `railway` in the path |

`MONGOHOST`, `MONGOPORT`, `MONGOUSER`, `MONGOPASSWORD` and `MONGO_INITDB_ROOT_*` are also set, with the same names as Railway's MongoDB. `MONGO_URL` ends in `/?replicaSet=rs0&authSource=admin`; to name a database, put it before the `?` instead of appending it to the end.

**Prisma.** The MongoDB connector of Prisma ORM 6.x needs a replica set, and this template provides one. Prisma's docs (checked 2026-10-31) list MongoDB as not yet supported in Prisma ORM 7 and as early access in Prisma ORM 8 (`@prisma/orm-mongo`, MongoDB 8.0 or newer).

```prisma
datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}
```

**From your machine** (Compass, `mongosh`, `prisma db push`), use `MONGO_PUBLIC_URL` or `DATABASE_PUBLIC_URL`. They go through Railway's TCP proxy with `directConnection=true`, because the member host `mongodb.railway.internal` cannot be resolved outside Railway. Do not add `replicaSet=` to the public URLs. Proxy traffic is not encrypted (the same as Railway's MongoDB) and is billed as egress. To keep the database private, delete the TCP proxy under Settings → Networking.

**First steps**

1. Deploy and wait for this line in the MongoDB logs: `[mongodb-rs-init] replica set rs0 ready: PRIMARY mongodb.railway.internal:27017`.
2. Connect with `mongosh "{MONGO_PUBLIC_URL}"` and run `rs.status().members[0].stateStr`. It returns `PRIMARY`.
3. Reference `MONGO_URL` or `DATABASE_URL` from your app.
4. Run the first backup now with `railway cron run --service "MongoDB Backup"`, or wait for 03:15 UTC. Then check the Bucket's Files tab.

**Restore** (download `mongodb.archive.gz` from the Bucket):

```bash
mongorestore --uri "{MONGO_PUBLIC_URL}" --gzip --archive=mongodb.archive.gz \
  --oplogReplay --drop --nsExclude "admin.system.users" --nsExclude "admin.system.roles"
```

This drops and re-creates every collection in the archive and keeps the current users. To restore without local tools, set `BACKUP_RESTORE_RUN={run folder}` on MongoDB Backup and trigger the job. It restores that run once, writes `RESTORED.txt` next to it, then goes back to normal backups. Clear the variable afterwards.

**Sizing and tuning.** The WiredTiger cache uses MongoDB's own formula, 50% of (RAM − 1 GB) with a minimum of 0.25 GB. The RAM figure is the container limit, capped at 8 GB, so a large plan limit does not reserve memory the data never uses. Override it with `MONGO_MEMORY_LIMIT_MB` or `MONGO_CACHE_SIZE_GB`. The oplog is 5% of the volume (128–2048 MB) when it is first created. A value of 990 or more in `MONGO_OPLOG_SIZE_MB` resizes an existing oplog. Each boot logs the values it chose.

**Scaling.** MongoDB scales vertically: raise the service's RAM, CPU and volume. This is one replica-set member. There is no failover; for that, use Railway's Mongo HA, which runs three members. Railway service replicas cannot share a volume, so keep one replica.

**Versions and upgrades.** The images are pinned by tag and digest: `mongo:8.0.34-noble` in `services/mongodb/Dockerfile` and `services/backup/Dockerfile`. 8.0 is MongoDB's current 8.x major release, with support until 2029-10-31. Minor releases such as 8.3 are only patched until the next minor release. For a patch update, change the tag and digest in both Dockerfiles. For a major upgrade to 9.0, take a backup first, change the image in both Dockerfiles, redeploy, then run `db.adminCommand({setFeatureCompatibilityVersion: "9.0", confirm: true})`.

**Good to know**

- `MONGO_INITDB_ROOT_PASSWORD` only takes effect on the first boot. To rotate the password, run `db.changeUserPassword()` first, then update the variable.
- If you change the service's private hostname (Settings → Networking), the template moves the replica-set member to the new name at the next boot.
- Do not start this volume as a standalone `mongod`. A replica-set data directory needs `--replSet`.
- License: MongoDB Community Server is under the Server Side Public License (SSPL) v1. Using it as your app's database is common, but offering MongoDB itself as a service to third parties has conditions. This is not legal advice; see NOTICE.md.

### Why Deploy MongoDB on Railway?

Railway runs the database, its volume, a private network and the backup job in one project. Usage-based pricing keeps an idle database cheap. With a replica set from the first boot, your app can use Prisma, transactions and change streams without managing MongoDB yourself.
