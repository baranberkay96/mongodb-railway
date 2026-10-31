# MongoDB Backup (Railway cron job): mongodump/mongorestore/mongosh from the same official image
# as the database, plus rclone for the Railway Bucket.
#
# Both images are pinned by multi-arch index digest. Keep the mongo tag and digest identical to
# services/mongodb/Dockerfile, so the backup tools always match the server they dump.
FROM rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5 AS rclone

FROM mongo:8.0.34-noble@sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399

# rclone's release binary is static (CGO_ENABLED=0 in rclone's Dockerfile), so it runs on Ubuntu.
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chmod=0755 mongodb-backup /usr/local/bin/mongodb-backup
COPY --chmod=0644 primary.js /usr/local/lib/mongodb-backup/primary.js
COPY --chmod=0644 mongosh.conf /etc/mongosh.conf

ENV HOME=/tmp

# Fail the build early if a tool is missing.
RUN set -eux; \
    bash -n /usr/local/bin/mongodb-backup; \
    rclone version; \
    mongodump --version; \
    mongorestore --version; \
    mongosh --version; \
    gzip --version > /dev/null; \
    date -u -d @0 +%Y > /dev/null

# Runs as the image's unprivileged mongodb user (uid 999); it needs no files of its own.
USER mongodb

ENTRYPOINT ["/usr/local/bin/mongodb-backup"]
CMD ["backup"]
