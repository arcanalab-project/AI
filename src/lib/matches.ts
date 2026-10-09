export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function assertNotSelf(from: string, to: string) {
  if (from === to) {
    throw new Error("Non puoi mettere like a te stesso");
  }
}

type Coll<T extends object> = {
  updateOne(
    filter: object,
    update: object,
    options: { upsert: boolean },
  ): Promise<{ upsertedCount?: number; matchedCount?: number }>;
  findOne(filter: object): Promise<T | null>;
};

export type InteractionDoc = {
  datasetId: string;
  fromProfileId: string;
  toProfileId: string;
  type: "like" | "pass";
  createdAt: Date;
};

export type MatchDoc = {
  datasetId: string;
  pairKey: string;
  userIds: [string, string];
  status: "matched";
  createdAt: Date;
};

/**
 * Idempotent like/pass + match.
 * Uniqueness of (dataset, from, to) and of (dataset, pairKey) is the source of truth.
 * Existence-check-then-insert alone is not enough under concurrency.
 */
export async function recordInteraction(
  interactions: Coll<InteractionDoc>,
  matches: Coll<MatchDoc>,
  input: {
    datasetId: string;
    fromProfileId: string;
    toProfileId: string;
    type: "like" | "pass";
  },
) {
  assertNotSelf(input.fromProfileId, input.toProfileId);
  const now = new Date();
  const likeResult = await interactions.updateOne(
    {
      datasetId: input.datasetId,
      fromProfileId: input.fromProfileId,
      toProfileId: input.toProfileId,
    },
    {
      $setOnInsert: {
        datasetId: input.datasetId,
        fromProfileId: input.fromProfileId,
        toProfileId: input.toProfileId,
        type: input.type,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const existing = await interactions.findOne({
    datasetId: input.datasetId,
    fromProfileId: input.fromProfileId,
    toProfileId: input.toProfileId,
  });
  const created = (likeResult.upsertedCount ?? 0) > 0;
  const storedType = existing?.type ?? input.type;

  if (storedType !== "like") {
    return {
      interaction: existing,
      created,
      match: null as MatchDoc | null,
      matchCreated: false,
      note: created
        ? undefined
        : "Interazione già presente: operazione idempotente, nessun duplicato.",
    };
  }

  const reciprocal = await interactions.findOne({
    datasetId: input.datasetId,
    fromProfileId: input.toProfileId,
    toProfileId: input.fromProfileId,
    type: "like",
  });
  if (!reciprocal) {
    return {
      interaction: existing,
      created,
      match: null,
      matchCreated: false,
      note: created
        ? undefined
        : "Interazione già presente: operazione idempotente, nessun duplicato.",
    };
  }

  const key = pairKey(input.fromProfileId, input.toProfileId);
  const userIds = [input.fromProfileId, input.toProfileId].sort() as [string, string];
  const matchWrite = await matches.updateOne(
    { datasetId: input.datasetId, pairKey: key },
    {
      $setOnInsert: {
        datasetId: input.datasetId,
        pairKey: key,
        userIds,
        status: "matched",
        createdAt: now,
      },
    },
    { upsert: true },
  );
  const match = await matches.findOne({ datasetId: input.datasetId, pairKey: key });
  return {
    interaction: existing,
    created,
    match,
    matchCreated: (matchWrite.upsertedCount ?? 0) > 0,
    note: created
      ? undefined
      : "Interazione già presente: operazione idempotente, nessun duplicato.",
  };
}
