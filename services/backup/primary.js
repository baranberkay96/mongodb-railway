// Readiness probe for the backup job, run as
//   mongosh --nodb --quiet --norc --file primary.js
// Connects with MONGO_URL from the environment (never from argv). Exit 0 and prints
// "{setName} {primary} {version}" when a writable primary answers; exit 2 otherwise.
const base = process.env.MONGO_URL || '';
const uri = base + (base.includes('?') ? '&' : '?') + 'serverSelectionTimeoutMS=10000&connectTimeoutMS=10000';

function probe() {
  try {
    const db = connect(uri).getSiblingDB('admin');
    const hello = db.runCommand({ hello: 1 });
    if (!hello.isWritablePrimary) {
      return { code: 2, text: 'not ready: no writable primary (setName=' + (hello.setName || 'none') + ')' };
    }
    if (!hello.setName) {
      return { code: 2, text: 'not ready: the server is not a replica set member (mongodump --oplog needs one)' };
    }
    const info = db.runCommand({ buildInfo: 1 });
    return { code: 0, text: hello.setName + ' ' + hello.primary + ' ' + info.version };
  } catch (e) {
    const message = String((e && e.message) || e).replace(/mongodb(\+srv)?:\/\/[^@\s]*@/g, 'mongodb://***@');
    return { code: 2, text: 'not ready: ' + message };
  }
}

// quit() stays outside the try block, so it can never be caught as an error.
const result = probe();
print(result.text);
quit(result.code);
