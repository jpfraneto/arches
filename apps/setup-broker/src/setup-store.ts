export type SetupStoreMap<T> = {
  readonly size: number;
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
};

export type SetupBrokerStore<SessionRecord> = {
  sessions: SetupStoreMap<SessionRecord>;
  slugReservations: SetupStoreMap<string>;
  signerRequestTokens: SetupStoreMap<string>;
  clear(): void;
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
    clear() {
      records.clear();
    },
  };
}
