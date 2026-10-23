import { resolveDatabaseUrl } from "./databaseUrl";
import { withFileLock } from "./fileLock";

// All writers use the same lock before a read/modify/write transaction. SQLite
// remains the source of truth; the lock avoids deferred-transaction upgrades
// racing across processes. It is independent of the media lock.
export function withDatabaseWrite<T>(operation: () => Promise<T>): Promise<T> {
  return withFileLock(`${resolveDatabaseUrl().slice(5)}.write.lock`, operation);
}
