import { describe, expect, it, vi } from 'vitest';

import type { OdCredentials } from './od-credentials';
import {
  bytesToBase64,
  COMM_TYPE_SEDATION_NOTE,
  DOC_CATEGORY_IV_SEDATION,
  getPatient,
  isOdError,
  OdError,
  postCommlog,
  toRawBase64,
  uploadDocument,
  type FetchLike,
} from './opendental';

/**
 * Fake keys. Distinctive strings so the redaction test can prove they never
 * survive into an error message.
 */
const CREDS: OdCredentials = { developerKey: 'DEVKEY-AAA', customerKey: 'CUSTKEY-BBB' };

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(responses: ReadonlyArray<{ status: number; body?: string }>): {
  fetch: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve(
      new Response(next?.body ?? '', { status: next?.status ?? 200 }) as Response,
    );
  };
  return { fetch, calls };
}

function bodyOf(call: Call | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init.body ?? '{}')) as Record<string, unknown>;
}

describe('auth and request shape', () => {
  it('sends the ODFHIR header in the exact documented form', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: '{"LName":"Test","FName":"P"}' }]);
    await getPatient(1, CREDS, fetch);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('ODFHIR DEVKEY-AAA/CUSTKEY-BBB');
    expect(calls[0]?.url).toBe('https://api.opendental.com/api/v1/patients/1');
  });

  it('posts the commlog body Open Dental expects, including Mode_', async () => {
    const { fetch, calls } = stubFetch([{ status: 201 }]);
    await postCommlog({ patNum: 7, note: 'note body' }, CREDS, fetch);

    expect(calls[0]?.url).toBe('https://api.opendental.com/api/v1/commlogs');
    expect(bodyOf(calls[0])).toEqual({
      PatNum: 7,
      CommType: COMM_TYPE_SEDATION_NOTE,
      Mode_: 'None',
      SentOrReceived: 'Sent',
      Note: 'note body',
    });
  });

  it('uploads with the leading dot on the extension and the practice category', async () => {
    const { fetch, calls } = stubFetch([{ status: 201, body: '{"DocNum":42}' }]);
    const result = await uploadDocument(
      { patNum: 7, rawBase64: 'QUJD', description: 'Sedation note', dateCreated: '2026-08-14' },
      CREDS,
      fetch,
    );

    expect(calls[0]?.url).toBe('https://api.opendental.com/api/v1/documents/Upload');
    expect(bodyOf(calls[0])).toEqual({
      PatNum: 7,
      rawBase64: 'QUJD',
      extension: '.pdf',
      Description: 'Sedation note',
      DateCreated: '2026-08-14',
      DocCategory: DOC_CATEGORY_IV_SEDATION,
    });
    expect(result.docNum).toBe(42);
  });

  it('pins the practice-specific IDs', () => {
    // These were created inside this practice's Open Dental. A "cleanup" that
    // changed them would file notes under the wrong definition, undeletably.
    expect(COMM_TYPE_SEDATION_NOTE).toBe(711);
    expect(DOC_CATEGORY_IV_SEDATION).toBe(136);
  });

  it('truncates a full timestamp to the bare date the API wants', async () => {
    const { fetch, calls } = stubFetch([{ status: 201, body: '{}' }]);
    await uploadDocument(
      {
        patNum: 7,
        rawBase64: 'QUJD',
        description: 'd',
        dateCreated: '2026-08-14T13:30:00.000Z',
      },
      CREDS,
      fetch,
    );
    expect(bodyOf(calls[0])['DateCreated']).toBe('2026-08-14');
  });
});

describe('status handling', () => {
  it('treats only 201 as a successful write', async () => {
    // A 200 here means the request was understood but nothing was created.
    const { fetch } = stubFetch([{ status: 200 }]);
    await expect(postCommlog({ patNum: 7, note: 'x' }, CREDS, fetch)).rejects.toSatisfy(
      (e: unknown) => isOdError(e) && e.kind === 'http' && e.status === 200,
    );
  });

  it('reports the HTTP status so the operator sees it', async () => {
    const { fetch } = stubFetch([{ status: 401, body: 'Unauthorized' }]);
    await expect(postCommlog({ patNum: 7, note: 'x' }, CREDS, fetch)).rejects.toSatisfy(
      (e: unknown) => isOdError(e) && e.status === 401,
    );
  });

  it('classifies a dropped connection as a network failure, not an HTTP one', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(postCommlog({ patNum: 7, note: 'x' }, CREDS, fetch)).rejects.toSatisfy(
      (e: unknown) => isOdError(e) && e.kind === 'network',
    );
  });

  /**
   * A POST whose answer was lost may still have been applied, and nothing can
   * be deleted — so the message has to stop a reflexive retry.
   */
  it('warns that a failed POST may still have been filed', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(postCommlog({ patNum: 7, note: 'x' }, CREDS, fetch)).rejects.toThrow(
      /may still have been filed/i,
    );
  });

  it('does not add that warning to a read', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(getPatient(1, CREDS, fetch)).rejects.not.toThrow(/may still have been filed/i);
  });

  it('accepts a 201 whose body is unreadable rather than inviting a retry', async () => {
    const { fetch } = stubFetch([{ status: 201, body: 'not json' }]);
    await expect(
      uploadDocument(
        { patNum: 7, rawBase64: 'QUJD', description: 'd', dateCreated: '2026-08-14' },
        CREDS,
        fetch,
      ),
    ).resolves.toEqual({ docNum: 0 });
  });
});

describe('refusing before an irreversible write', () => {
  it.each([0, -1, 1.5, Number.NaN])('rejects PatNum %s without calling the API', async (bad) => {
    const { fetch, calls } = stubFetch([{ status: 201 }]);
    await expect(postCommlog({ patNum: bad, note: 'x' }, CREDS, fetch)).rejects.toBeInstanceOf(
      OdError,
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty note and an empty file', async () => {
    const { fetch, calls } = stubFetch([{ status: 201 }]);
    await expect(postCommlog({ patNum: 7, note: '   ' }, CREDS, fetch)).rejects.toBeInstanceOf(
      OdError,
    );
    await expect(
      uploadDocument(
        { patNum: 7, rawBase64: '', description: 'd', dateCreated: '2026-08-14' },
        CREDS,
        fetch,
      ),
    ).rejects.toBeInstanceOf(OdError);
    expect(calls).toHaveLength(0);
  });

  it('rejects a patient record with no name — there is nothing to confirm against', async () => {
    const { fetch } = stubFetch([{ status: 200, body: '{"PatNum":1,"LName":"","FName":""}' }]);
    await expect(getPatient(1, CREDS, fetch)).rejects.toBeInstanceOf(OdError);
  });
});

describe('credential safety', () => {
  it('never leaks a key into an error message, even when the API echoes it', async () => {
    const echo = `401 for ODFHIR ${CREDS.developerKey}/${CREDS.customerKey}`;
    const { fetch } = stubFetch([{ status: 401, body: echo }]);

    const error = await postCommlog({ patNum: 7, note: 'x' }, CREDS, fetch).catch(
      (e: unknown) => e,
    );

    const message = String((error as Error).message);
    expect(message).not.toContain(CREDS.developerKey);
    expect(message).not.toContain(CREDS.customerKey);
    expect(message).toContain('[redacted]');
  });
});

describe('base64', () => {
  it('strips a data: prefix and any whitespace', () => {
    expect(toRawBase64('data:application/pdf;base64,QUJD')).toBe('QUJD');
    expect(toRawBase64('QUJ\nD ')).toBe('QUJD');
    expect(toRawBase64('QUJD')).toBe('QUJD');
  });

  it('matches a known encoding', () => {
    expect(bytesToBase64(new Uint8Array([65, 66, 67]))).toBe('QUJD');
  });

  /**
   * The reason this is chunked: a real sedation-note PDF is hundreds of KB,
   * and spreading that many arguments into String.fromCharCode in one call
   * overflows the stack. 300 KB is comfortably past where the naive version
   * dies.
   */
  it('survives a PDF-sized array without overflowing the stack', () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 256);
    const encoded = bytesToBase64(big);
    expect(encoded.length).toBeGreaterThan(390_000);
    expect(Buffer.from(encoded, 'base64').equals(Buffer.from(big))).toBe(true);
  });
});

describe('timeouts', () => {
  it('aborts a hung request and reports it as a timeout', async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const pending = getPatient(1, CREDS, fetch, 20_000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_001);
    const error = await pending;

    expect(isOdError(error) && error.kind).toBe('timeout');
    vi.useRealTimers();
  });
});
