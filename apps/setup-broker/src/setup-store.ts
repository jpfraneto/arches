import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

export type SetupStoreMap<T> = {
  readonly size: number;
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  entries(): Array<[string, T]>;
  clear(): void;
};

export type SetupBrokerStore<SessionRecord> = {
  sessions: SetupStoreMap<SessionRecord>;
  slugReservations: SetupStoreMap<string>;
  signerRequestTokens: SetupStoreMap<string>;
  clear(): void;
};

export type SetupBrokerStoreSnapshot<SessionRecord> = {
  schemaVersion: 1;
  generatedAt: string;
  sessions: Record<string, SessionRecord>;
  slugReservations: Record<string, string>;
};

export type SnapshotSetupBrokerStoreOptions<SessionRecord> = {
  now?: () => Date;
  sanitizeSession?: (record: SessionRecord) => SessionRecord;
};

export type JsonFileSetupBrokerStoreOptions<SessionRecord> = {
  filePath: string;
  now?: () => Date;
  sanitizeSession: (record: SessionRecord) => SessionRecord;
};

export function createInMemorySetupBrokerStore<SessionRecord>(): SetupBrokerStore<SessionRecord> {
  const sessions = createInMemoryStoreMap<SessionRecord>();
  const slugReservations = createInMemoryStoreMap<string>();
  const signerRequestTokens = createInMemoryStoreMap<string>();

  return {
    sessions,
    slugReservations,
    signerRequestTokens,
    clear() {
      sessions.clear();
      slugReservations.clear();
      signerRequestTokens.clear();
    },
  };
}

export function createJsonFileSetupBrokerStore<SessionRecord>(
  options: JsonFileSetupBrokerStoreOptions<SessionRecord>,
): SetupBrokerStore<SessionRecord> {
  const loadedSnapshot = loadSetupBrokerStoreSnapshot<SessionRecord>(options.filePath);
  let store: SetupBrokerStore<SessionRecord>;
  const persist = () => {
    persistSetupBrokerStoreSnapshot(store, options);
  };
  const sessions = createInMemoryStoreMap<SessionRecord>(
    Object.entries(loadedSnapshot?.sessions ?? {}),
    persist,
  );
  const slugReservations = createInMemoryStoreMap<string>(
    Object.entries(loadedSnapshot?.slugReservations ?? {}),
    persist,
  );
  const signerRequestTokens = createInMemoryStoreMap<string>();

  store = {
    sessions,
    slugReservations,
    signerRequestTokens,
    clear() {
      sessions.clear();
      slugReservations.clear();
      signerRequestTokens.clear();
    },
  };

  return store;
}

export function snapshotSetupBrokerStore<SessionRecord>(
  store: SetupBrokerStore<SessionRecord>,
  options: SnapshotSetupBrokerStoreOptions<SessionRecord> = {},
): SetupBrokerStoreSnapshot<SessionRecord> {
  const sanitizeSession = options.sanitizeSession ?? ((record: SessionRecord) => record);
  const now = options.now ?? (() => new Date());

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    sessions: Object.fromEntries(
      store.sessions.entries().map(([key, record]) => [key, sanitizeSession(record)]),
    ),
    slugReservations: Object.fromEntries(store.slugReservations.entries()),
  };
}

function persistSetupBrokerStoreSnapshot<SessionRecord>(
  store: SetupBrokerStore<SessionRecord>,
  options: JsonFileSetupBrokerStoreOptions<SessionRecord>,
) {
  const snapshot = snapshotSetupBrokerStore(store, {
    now: options.now,
    sanitizeSession: options.sanitizeSession,
  });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const directory = dirname(options.filePath);
  const temporaryPath = `${options.filePath}.tmp`;

  mkdirSync(directory, { recursive: true });
  writeFileSync(temporaryPath, json, "utf8");
  renameSync(temporaryPath, options.filePath);
}

function loadSetupBrokerStoreSnapshot<SessionRecord>(
  filePath: string,
): SetupBrokerStoreSnapshot<SessionRecord> | undefined {
  if (!existsSync(filePath)) return undefined;

  const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as
    | SetupBrokerStoreSnapshot<SessionRecord>
    | undefined;
  if (snapshot?.schemaVersion !== 1) {
    throw new Error("Unsupported setup broker store snapshot schema version.");
  }

  return snapshot;
}

function createInMemoryStoreMap<T>(
  entries: Array<[string, T]> = [],
  onChange?: () => void,
): SetupStoreMap<T> {
  const records = new Map<string, T>(entries);

  return {
    get size() {
      return records.size;
    },
    get(key) {
      return records.get(key);
    },
    set(key, value) {
      records.set(key, value);
      onChange?.();
    },
    delete(key) {
      records.delete(key);
      onChange?.();
    },
    entries() {
      return [...records.entries()];
    },
    clear() {
      records.clear();
      onChange?.();
    },
  };
}
