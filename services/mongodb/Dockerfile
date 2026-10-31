# MongoDB 8.0 single-node replica set for Railway: the official image plus a start-up wrapper.
#
# Base: Docker Official Image mongo:8.0.34-noble (MongoDB Community Server 8.0.34 on Ubuntu 24.04),
# pinned by its multi-arch index digest (amd64 + arm64, built 2026-10-26). To upgrade a patch
# release, change the tag and digest together (see TEMPLATE.md, "Upgrades").
FROM mongo:8.0.34-noble@sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399

COPY --chmod=0755 mongodb-railway-start mongodb-rs-init /usr/local/bin/
# 0755, not 0644: BuildKit gives the directory it creates the same mode (unreadable for non-root users).
COPY --chmod=0755 rs-step.js /usr/local/lib/mongodb-railway/rs-step.js
COPY --chmod=0644 mongosh.conf /etc/mongosh.conf

# Fail the build early if the image layout this template relies on ever changes.
RUN set -eux; \
    install -d -o mongodb -g mongodb -m 0700 /etc/mongodb-railway; \
    bash -n /usr/local/bin/mongodb-railway-start; \
    bash -n /usr/local/bin/mongodb-rs-init; \
    mongod --version | grep -F 'db version v8.0.34'; \
    HOME=/tmp mongosh --version; \
    test -x /usr/local/bin/docker-entrypoint.sh; \
    command -v gosu flock awk df getent uname; \
    [ "$(id -u mongodb)" = 999 ]

# The data directory is the Railway volume at /data/db (declared in template.json, not here).
# Port 27017 is inherited from the base image.
ENTRYPOINT ["/usr/local/bin/mongodb-railway-start"]
CMD ["mongod"]
