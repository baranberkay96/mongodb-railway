# NOTICE

This Railway template is a community package. It is not affiliated with or endorsed by MongoDB, Inc., Prisma Data, Inc., the rclone project or Railway.

## What this template runs

| Component | Source | License |
|---|---|---|
| MongoDB Community Server 8.0.34 (`mongod`) | Docker Official Image `mongo:8.0.34-noble@sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399` (built 2026-10-26). It installs `mongodb-org` 8.0.34 from MongoDB's signed apt repository; the source is at https://github.com/mongodb/mongo, tag `r8.0.34` | Server Side Public License v1 (SSPL-1.0), `LICENSE-Community.txt` in the MongoDB repository |
| Image build files and `docker-entrypoint.sh` | https://github.com/docker-library/mongo, `8.0/Dockerfile` (commit `ea5191cb`, "Update 8.0 to 8.0.34") and `8.0/docker-entrypoint.sh` (commit `7c24b37b`). Used unmodified as the base image; the entrypoint in the pinned image is byte-identical to the repository file | Apache-2.0 |
| mongosh 2.x and MongoDB Database Tools 100.x (`mongodump`, `mongorestore`) | Installed in the same image (`mongodb-org-shell`, `mongodb-org-tools`) | Apache-2.0 |
| gosu, js-yaml | Bundled in the official image by docker-library | Apache-2.0 (gosu), MIT (js-yaml) |
| Ubuntu 24.04 base packages | `ubuntu:noble` inside the official image | Their own licenses; see `/usr/share/doc/*/copyright` in the image |
| rclone 1.75.2 (backup job only) | Static binary copied from `rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5` (built `CGO_ENABLED=0` by rclone's own Dockerfile at `v1.75.2`) | MIT, Copyright (c) 2012 Nick Craig-Wood |

The template does not modify, patch or rebuild MongoDB. Both Dockerfiles start `FROM` the unmodified official image. They add only the files listed below.

## Files written for this template

| File | Purpose |
|---|---|
| `services/mongodb/Dockerfile` | Adds the start-up files to the official image; no other change |
| `services/mongodb/mongodb-railway-start` | Image entrypoint. It validates the variables, writes the keyFile, adds a hosts entry for the member host, sizes the cache and oplog, applies the kernel workaround and takes the volume lock, then execs the official `docker-entrypoint.sh` |
| `services/mongodb/mongodb-rs-init`, `services/mongodb/rs-step.js` | Background reconciler. It initiates the replica set once, repairs the member host and resizes the oplog on request |
| `services/mongodb/mongosh.conf`, `services/backup/mongosh.conf` | Turn off mongosh telemetry |
| `services/backup/Dockerfile`, `services/backup/mongodb-backup`, `services/backup/primary.js` | The backup cron job. Its Bucket handling and retention logic are adapted from this project's own earlier backup job in the pgvector template, not from third-party code |
| `template.json`, `TEMPLATE.md`, `README.md`, `NOTICE.md` | Written for this template |

## Reused or not reused

- **Market templates** (`_market/`: `mongo`, `mongo-ha`, `dxhww9`, `mongodb-community-server-replica-set`). Their configurations carry no license. They were read only for settings: variable names, the start command flags of Railway's MongoDB, and the shape of the HA cluster. No README text is reused.
- **`railwayapp-templates/mongo-replica-set`** (MIT, the source of `dxhww9`). Read for comparison only; no file was copied. It uses a separate init service that must be deleted after the first deploy, and a public `MONGO_URL`.
- **`railwayapp-templates/mongo-ha`** has no license. Only its README was read, for operational facts:
  - the SERVER-121912 kernel range, and `glibc.pthread.rseq=1` as the workaround;
  - the note that a custom start command replaces the image ENTRYPOINT on Railway;
  - feature-compatibility-version handling after upgrades;
  - the risk of starting a replica-set data directory without `--replSet`.

  The behaviour here is implemented independently, in shell and mongosh, from MongoDB's documentation and source. No code was copied.

## SSPL notes

These are practical notes, not legal advice. Consult your own counsel for your situation.

- MongoDB Community Server is licensed under the SSPL v1. The SSPL is not an OSI-approved open-source license.
- Running the unmodified server as the database of your own application, as this template does, is the common use of MongoDB Community. The license of MongoDB does not extend to the data you store.
- Section 13 of the SSPL applies when you make the functionality of the program available to third parties as a service. In that case it requires you to publish the source of the whole service stack, including management and hosting software. If you offer MongoDB itself (for example "MongoDB as a service") to others, review the SSPL with counsel first.
- MongoDB Database Tools, mongosh, the docker-library image files and this package's own files are under permissive licenses (see the tables above) and add no SSPL obligations.

## Upstream material checked (2026-10-31)

- `docker-library/mongo`: `versions.json`. It lists 8.0.34 (source date 2026-09-24; the 8.0 release notes date the release 2026-10-13; EOL 2029-10-31), 8.3.13, 9.0.4 and 7.0.45; 8.2 is no longer listed. Also read: `8.0/Dockerfile` and `8.0/docker-entrypoint.sh`:
  - the initdb path removes `--replSet`, `--keyFile`, `--auth` and `--bind_ip*` for the temporary instance;
  - it creates the root user from `MONGO_INITDB_ROOT_*`;
  - it chowns `/data/db`;
  - it adds `--auth` and execs `mongod` through `gosu mongodb`.
- Docker Hub registry API, read without Docker:
  - `mongo:8.0.34-noble` index `sha256:3c649371…` (amd64 + arm64). Its amd64 config: no `User` (root), `ENTRYPOINT docker-entrypoint.sh`, `CMD mongod`, `HOME=/data/db`, `GLIBC_TUNABLES=glibc.pthread.rseq=0`, image volumes `/data/db` and `/data/configdb`, port 27017. Its last layer is the entrypoint script, compared byte for byte.
  - `rclone/rclone:1.75.2` index `sha256:2687085f…`.
- MongoDB's apt repository for `noble/mongodb-org/8.0`: newest `mongodb-database-tools` 100.20.0 and `mongodb-mongosh` 2.14.1. `mongodb-org-tools` 8.0.34 depends on `mongodb-database-tools`.
- `mongodb/mongo` at `r8.0.34`:
  - `src/mongo/db/startup_check_rseq.cpp`: mongod exits when TCMalloc per-CPU caches are active on kernels 6.19.0 to 7.0.13;
  - `src/mongo/db/mongod_options.cpp`: `--oplogSize` needs only a value above 0;
  - `jstests/replsets/isself_failure_restart.js`: a node that fails the self-check at startup stays REMOVED until a heartbeat from another member re-checks it;
  - `LICENSE-Community.txt`, `README.md` (license).
- `mongodb/mongo-tools` at `100.20.0`, `mongorestore/*.go`: `--nsExclude` skips `admin.system.users`/`roles` in archive mode, and `--dryRun` returns after reading the archive prelude and checking for the oplog.
- `mongodb-js/mongosh` `packages/shell-api/src/shell-api.ts` and `packages/cli-repl/src/cli-repl.ts`: `quit()` and `exit()` end the process.
- MongoDB documentation:
  - versioning (major and minor release lifecycle, sequential minor upgrades);
  - 8.0 release notes (kernel incompatibility warning, 8.0.30 to 8.0.34 fixes and CVEs);
  - `mongodump` (`--oplog` requirements and failure cases, `--archive`, `--gzip`) and its behaviour page;
  - mongosh scripts, environment variables and the global configuration file.
- Prisma documentation: MongoDB connector (replica set required, Prisma ORM 6.19 for MongoDB, Prisma ORM 7 not yet), supported databases and supported versions (Prisma ORM 8 `@prisma/orm-mongo` early access, MongoDB 8.0 minimum).
- Railway documentation: Cron Jobs (`railway cron run`, UTC schedules, skipped overlapping runs), Database View, Storage Buckets.

## Logos and trademarks

MongoDB and the MongoDB leaf logo are trademarks of MongoDB, Inc. Prisma is a trademark of Prisma Data, Inc. They are used only to describe what the template runs and what it is compatible with.

- Marketplace icon: `homarr-labs/dashboard-icons`, Apache-2.0, served via jsDelivr.
- Service icon: Railway's devicons.
