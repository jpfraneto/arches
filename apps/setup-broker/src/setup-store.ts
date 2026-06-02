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

function createInMemoryStoreMap<T>(): SetupStoreMap<T> {
  const records = new Map<string, T>();

  return {
    get size() {
      return records.size;
    },
    get(key) {
      return records.get(key);
    },
    set(key, value) {
      records.set(key, value);
    },
    delete(key) {
      records.delete(key);
    },
    entries() {
      return [...records.entries()];
    },
    clear() {
      records.clear();
    },
  };
}
