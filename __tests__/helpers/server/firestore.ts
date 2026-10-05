import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// An in-memory stand-in for adminDb. It keeps documents in a Map and answers
// the query shapes the routes use: where (==, in, <, <=, >, >=), orderBy,
// limit, startAfter (a value or a document), count, doc get/set/update, add,
// runTransaction and batch.
// It does not check composite indexes, and a transaction is not isolated.
//
// A test file installs it with
//   jest.mock('@/lib/firebase-admin', () => ({
//     adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
//   }));
// and then seeds and reads documents through the functions exported below.

export type Data = Record<string, unknown>;
type Op = '==' | 'in' | '<' | '<=' | '>' | '>=';
type Filter = { field: string; op: Op; value: unknown };
type Order = { field: string; dir: 'asc' | 'desc' };
type Sortable = string | number | boolean;

const store = new Map<string, Map<string, Data>>();
let autoId = 0;
let failure: Error | null = null;

function col(name: string): Map<string, Data> {
  let docs = store.get(name);
  if (!docs) {
    docs = new Map();
    store.set(name, docs);
  }
  return docs;
}

function guard(): void {
  if (failure) throw failure;
}

// Timestamps compare by their microsecond value, everything else as itself.
function key(v: unknown): Sortable | undefined {
  if (v instanceof Timestamp) return v.seconds * 1e6 + Math.floor(v.nanoseconds / 1000);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return undefined;
}

// serverTimestamp() becomes the current (test-controlled) time when written.
function materialise(data: Data): Data {
  const marker = FieldValue.serverTimestamp();
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v instanceof FieldValue && v.isEqual(marker) ? Timestamp.fromMillis(Date.now()) : v;
  }
  return out;
}

class DocSnap {
  readonly exists: boolean;
  readonly ref: DocRef;

  constructor(collection: string, readonly id: string, private readonly stored: Data | undefined) {
    this.exists = stored !== undefined;
    this.ref = new DocRef(collection, id);
  }

  data(): Data | undefined {
    return this.stored === undefined ? undefined : { ...this.stored };
  }
}

class DocRef {
  constructor(readonly collection: string, readonly id: string) {}

  async get(): Promise<DocSnap> {
    guard();
    return new DocSnap(this.collection, this.id, col(this.collection).get(this.id));
  }

  async set(data: Data): Promise<void> {
    guard();
    col(this.collection).set(this.id, materialise(data));
  }

  async update(patch: Data): Promise<void> {
    guard();
    const current = col(this.collection).get(this.id);
    if (current === undefined) throw new Error('NOT_FOUND: no document to update');
    col(this.collection).set(this.id, { ...current, ...materialise(patch) });
  }
}

class Query {
  constructor(
    protected readonly collection: string,
    private readonly filters: Filter[] = [],
    private readonly order: Order | null = null,
    private readonly max: number | null = null,
    private readonly after: unknown = null,
  ) {}

  where(field: string, op: Op, value: unknown): Query {
    return new Query(this.collection, [...this.filters, { field, op, value }], this.order, this.max, this.after);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    return new Query(this.collection, this.filters, { field, dir }, this.max, this.after);
  }

  limit(n: number): Query {
    return new Query(this.collection, this.filters, this.order, n, this.after);
  }

  startAfter(value: unknown): Query {
    return new Query(this.collection, this.filters, this.order, this.max, value);
  }

  count() {
    return { get: async () => ({ data: () => ({ count: this.run().length }) }) };
  }

  async get() {
    const docs = this.run();
    return { empty: docs.length === 0, size: docs.length, docs };
  }

  private run(): DocSnap[] {
    guard();
    let rows = [...col(this.collection).entries()].map(([id, data]) => ({ id, data }));

    for (const f of this.filters) {
      rows = rows.filter(({ data }) => {
        const a = key(data[f.field]);
        if (a === undefined) return false;
        if (f.op === 'in') return (f.value as unknown[]).includes(a);
        const b = key(f.value);
        if (b === undefined) return false;
        switch (f.op) {
          case '==': return a === b;
          case '<': return a < b;
          case '<=': return a <= b;
          case '>': return a > b;
          case '>=': return a >= b;
        }
      });
    }

    if (this.order) {
      const { field, dir } = this.order;
      const sign = dir === 'desc' ? -1 : 1;
      // Like Firestore, ordering by a field leaves out documents without it,
      // and documents equal in that field follow each other by id.
      const keyed = rows.flatMap((row) => {
        const k = key(row.data[field]);
        return k === undefined ? [] : [{ ...row, k }];
      });
      const compare = (x: { k: Sortable; id: string }, y: { k: Sortable; id: string }) =>
        (x.k < y.k ? -1 : x.k > y.k ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0) * sign;
      keyed.sort(compare);
      if (this.after instanceof DocSnap) {
        // A document as the cursor resumes right after that document; a value
        // skips every document that has it.
        const k = key(this.after.data()?.[field]);
        const at = k === undefined ? null : { k, id: this.after.id };
        rows = at ? keyed.filter((row) => compare(row, at) > 0) : keyed;
      } else {
        const cursor = key(this.after);
        rows = cursor === undefined
          ? keyed
          : keyed.filter(({ k }) => (dir === 'desc' ? k < cursor : k > cursor));
      }
    }

    if (this.max !== null) rows = rows.slice(0, this.max);
    return rows.map((r) => new DocSnap(this.collection, r.id, r.data));
  }
}

class Collection extends Query {
  doc(id?: string): DocRef {
    return new DocRef(this.collection, id ?? `auto-${++autoId}`);
  }

  async add(data: Data): Promise<DocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export const db = {
  collection: (name: string) => new Collection(name),

  async runTransaction<T>(
    fn: (tx: { get: (q: Query) => ReturnType<Query['get']>; set: (ref: DocRef, data: Data) => void }) => Promise<T>,
  ): Promise<T> {
    guard();
    return fn({
      get: (q) => q.get(),
      set: (ref, data) => {
        guard();
        col(ref.collection).set(ref.id, materialise(data));
      },
    });
  },

  batch() {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: DocRef, patch: Data) => {
        ops.push(() => ref.update(patch));
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  },
};

export function resetDb(): void {
  store.clear();
  autoId = 0;
  failure = null;
}

export function seed(collection: string, id: string, data: Data): void {
  col(collection).set(id, { ...data });
}

export function read(collection: string, id: string): Data | undefined {
  const data = col(collection).get(id);
  return data === undefined ? undefined : { ...data };
}

export function all(collection: string): Array<Data & { id: string }> {
  return [...col(collection).entries()].map(([id, data]) => ({ ...data, id }));
}

// Every read and write fails with this error until resetDb(), like a Firestore
// outage.
export function breakDb(error: Error = new Error('UNAVAILABLE: fake Firestore outage')): void {
  failure = error;
}

export const ts = (iso: string): Timestamp => Timestamp.fromMillis(Date.parse(iso));

export const LAB8: Data = {
  code: 'LAB8',
  name_th: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต',
  is_active: true,
};

export function seedBooking(
  id: string,
  booking: { user?: string; lab?: string; status?: string; start: string | number; end: string | number } & Data,
): void {
  const { user = 'student-1', lab = 'LAB8', status = 'confirmed', start, end, ...rest } = booking;
  const at = (t: string | number) => Timestamp.fromMillis(typeof t === 'number' ? t : Date.parse(t));
  seed('bookings', id, { user_id: user, lab_id: lab, status, start_time: at(start), end_time: at(end), ...rest });
}
