// One reconciliation step for the single-node replica set, run by mongodb-rs-init with
//   mongosh --nodb --quiet --norc --file rs-step.js
// It connects to the local mongod as the root user (credentials from the environment, never
// from argv) and moves the replica set one step towards "initiated, member host correct, PRIMARY".
// The exit code tells mongodb-rs-init what happened; one line of text says why.
const EXIT = { READY: 0, RETRY: 10, CHANGED: 11, WAITING: 12, AUTH: 20 };
const STATE_PRIMARY = 1;
const STATE_REMOVED = 10;
const OPLOG_RESIZE_MIN_MB = 990;

const env = process.env;
const rsName = env.MONGO_REPLICA_SET_NAME;
const memberHost = env.MONGO_REPLICA_SET_HOST;
const oplogTargetMb = /^[0-9]+$/.test(env.MONGO_OPLOG_SIZE_MB || '') ? Number(env.MONGO_OPLOG_SIZE_MB) : 0;

function finish(code, message) {
  if (message) print(message);
  quit(code);
}

// mongosh may throw or return { ok: 0 } for a failed command; normalise both to a result object.
function run(fn) {
  try {
    return fn();
  } catch (e) {
    return { ok: 0, code: e.code, codeName: e.codeName, errmsg: String((e && e.message) || e) };
  }
}

function isAuthError(r) {
  return r.code === 18 || r.codeName === 'AuthenticationFailed' || /Authentication failed/i.test(r.errmsg || '');
}

function describe(r) {
  return (r.codeName || r.code || 'error') + ': ' + (r.errmsg || JSON.stringify(r));
}

function connectLocal() {
  const uri = 'mongodb://' + encodeURIComponent(env.MONGO_INITDB_ROOT_USERNAME || '') + ':' +
    encodeURIComponent(env.MONGO_INITDB_ROOT_PASSWORD || '') +
    '@127.0.0.1:27017/admin?authSource=admin&directConnection=true' +
    '&serverSelectionTimeoutMS=5000&connectTimeoutMS=5000';
  const c = run(() => ({ ok: 1, db: connect(uri) }));
  if (!c.ok) finish(isAuthError(c) ? EXIT.AUTH : EXIT.RETRY, 'connect ' + describe(c));
  const hello = run(() => c.db.runCommand({ hello: 1 }));
  if (!hello.ok) finish(isAuthError(hello) ? EXIT.AUTH : EXIT.RETRY, 'hello ' + describe(hello));
  return c.db.getSiblingDB('admin');
}

// Point the only member at memberHost. A normal reconfig needs a primary; force works in any state.
function reconfigure(admin, config, force) {
  const next = Object.assign({}, config, {
    version: config.version + 1,
    members: [Object.assign({}, config.members[0], { host: memberHost })],
  });
  delete next.term;
  return run(() => admin.runCommand({ replSetReconfig: next, force: force }));
}

function initiate(admin) {
  const r = run(() => admin.runCommand({
    replSetInitiate: { _id: rsName, members: [{ _id: 0, host: memberHost }] },
  }));
  if (r.ok) finish(EXIT.CHANGED, 'initiated replica set ' + rsName + ' with member ' + memberHost);
  if (r.code === 23) finish(EXIT.CHANGED, 'replica set already initiated');
  if (r.code === 93) {
    finish(EXIT.RETRY, 'waiting until ' + memberHost + ' resolves to this container (' + describe(r) + ')');
  }
  finish(EXIT.RETRY, 'replSetInitiate ' + describe(r));
}

function repairRemoved(admin) {
  const got = run(() => admin.runCommand({ replSetGetConfig: 1 }));
  if (!got.ok || !got.config) finish(EXIT.RETRY, 'node is REMOVED and replSetGetConfig failed: ' + describe(got));
  if (got.config.members.length !== 1) {
    finish(EXIT.WAITING, 'node is REMOVED from a ' + got.config.members.length + '-member set; not changing it');
  }
  const r = reconfigure(admin, got.config, true);
  if (r.ok) finish(EXIT.CHANGED, 'node was REMOVED; force-reconfigured the member as ' + memberHost);
  finish(EXIT.RETRY, 'node is REMOVED; waiting until ' + memberHost + ' resolves to this container (' + describe(r) + ')');
}

function resizeOplog(admin) {
  if (oplogTargetMb === 0) return '';
  if (oplogTargetMb < OPLOG_RESIZE_MIN_MB) {
    return '; MONGO_OPLOG_SIZE_MB=' + oplogTargetMb + ' only applies to a new oplog (replSetResizeOplog needs >= 990)';
  }
  const stats = run(() => {
    const cursor = admin.getSiblingDB('local').getCollection('oplog.rs').aggregate([{ $collStats: { storageStats: {} } }]);
    const docs = cursor.toArray();
    return { ok: 1, doc: docs[0] };
  });
  if (!stats.ok || !stats.doc) return '; could not read the oplog size: ' + describe(stats);
  const currentMb = Math.round(Number(stats.doc.storageStats.maxSize) / 1048576);
  if (Math.abs(currentMb - oplogTargetMb) <= 1) return '; oplog ' + currentMb + ' MB';
  const r = run(() => admin.runCommand({ replSetResizeOplog: 1, size: oplogTargetMb }));
  return r.ok ? '; oplog resized ' + currentMb + ' -> ' + oplogTargetMb + ' MB'
    : '; oplog resize to ' + oplogTargetMb + ' MB failed: ' + describe(r);
}

function main() {
  if (!rsName || !memberHost) finish(EXIT.RETRY, 'MONGO_REPLICA_SET_NAME or MONGO_REPLICA_SET_HOST is empty');
  const admin = connectLocal();
  const status = run(() => admin.runCommand({ replSetGetStatus: 1 }));

  if (!status.ok) {
    if (status.code === 94) initiate(admin); // NotYetInitialized
    if (status.code === 76) finish(EXIT.RETRY, 'mongod is still in its first-boot setup (no --replSet yet)');
    if (status.code === 93) repairRemoved(admin); // InvalidReplicaSetConfig: this node is not in the config
    if (isAuthError(status)) finish(EXIT.AUTH, 'replSetGetStatus ' + describe(status));
    finish(EXIT.RETRY, 'replSetGetStatus ' + describe(status));
  }
  if (status.myState === STATE_REMOVED) repairRemoved(admin);

  const got = run(() => admin.runCommand({ replSetGetConfig: 1 }));
  if (!got.ok || !got.config) finish(EXIT.RETRY, 'replSetGetConfig ' + describe(got));
  const config = got.config;
  if (config.members.length === 1 && config.members[0].host !== memberHost) {
    const r = reconfigure(admin, config, status.myState !== STATE_PRIMARY);
    if (r.ok) finish(EXIT.CHANGED, 'member host changed ' + config.members[0].host + ' -> ' + memberHost);
    finish(EXIT.RETRY, 'reconfig to ' + memberHost + ' failed: ' + describe(r));
  }
  if (status.myState !== STATE_PRIMARY) {
    const self = (status.members || []).find((m) => m.self) || {};
    finish(EXIT.WAITING, 'member state ' + (self.stateStr || status.myState) + ', waiting for PRIMARY');
  }
  const extra = config.members.length === 1 ? '' : '; ' + config.members.length + ' members (host management skipped)';
  finish(EXIT.READY, 'replica set ' + rsName + ' ready: PRIMARY ' + config.members[0].host + extra + resizeOplog(admin));
}

main();
