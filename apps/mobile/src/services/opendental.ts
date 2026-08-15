import type { OdCredentials } from './od-credentials';

/**
 * The only place in the app where fetch() touches Open Dental.
 *
 * CORS is fully open on this API, so the PWA calls it directly — there is no
 * relay, proxy or native HTTP path to keep in sync.
 *
 * Two things every caller has to know:
 *
 * 1. Writes are PERMANENT. A commlog cannot be deleted through the API, and
 *    DELETE /documents/{DocNum} fails at this practice (LocalAtoZ storage the
 *    cloud API cannot reach). There is no cleanup path to fall back on, so a
 *    duplicate send is a permanent duplicate in the patient's chart.
 * 2. The API allows one request per second. Spacing successive calls
 *    (~1100 ms, strictly sequential) is the caller's job — this module does
 *    not queue, so two calls fired together earn a 429.
 */

export const OD_BASE_URL = 'https://api.opendental.com/api/v1';

/**
 * Practice-specific IDs, created and confirmed inside this practice's Open
 * Dental on 2026-08-14. They are not Open Dental defaults and must never be
 * invented, guessed or "corrected" — a wrong number files the note under the
 * wrong definition or drops the PDF into the wrong image category, with no
 * way to delete it afterwards.
 */
/** Commlog definition: "Sedation Note". */
export const COMM_TYPE_SEDATION_NOTE = 711;
/** Image category: "IV Sedation Consents". */
export const DOC_CATEGORY_IV_SEDATION = 136;

/** Long enough for a several-hundred-KB PDF on practice wifi. */
export const OD_TIMEOUT_MS = 20_000;

/**
 * Injected so tests mock at the network boundary and never reach the live
 * API. `init` is required rather than optional so that both the global fetch
 * and narrower test doubles stay assignable under strictFunctionTypes.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export type OdErrorKind = 'http' | 'network' | 'timeout';

/**
 * The only error this module throws. Raw exceptions (fetch's TypeError, an
 * AbortError, a JSON parse failure) are never allowed to escape, so a caller
 * can render one failure surface instead of guessing at `unknown`.
 */
export class OdError extends Error {
  readonly kind: OdErrorKind;
  /** HTTP status, present only when `kind === 'http'`. */
  readonly status: number | undefined;

  constructor(kind: OdErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'OdError';
    this.kind = kind;
    this.status = status;
  }
}

export function isOdError(error: unknown): error is OdError {
  return error instanceof OdError;
}

/** One phrasing for the failure surface, so every caller reports it alike. */
export function describeOdError(error: OdError): string {
  return error.kind === 'http' && error.status !== undefined
    ? `${error.message} (HTTP ${error.status})`
    : error.message;
}

export interface OdPatient {
  readonly PatNum: number;
  readonly LName: string;
  readonly FName: string;
  readonly Birthdate: string;
}

export interface OdCommlogInput {
  readonly patNum: number;
  /**
   * Sent verbatim. API writes are force-zeroed to UserNum 0, so the entry
   * shows no author in Open Dental — attribution has to be a line the caller
   * prepends inside this text.
   */
  readonly note: string;
}

export interface OdDocumentInput {
  readonly patNum: number;
  /** Base64 PDF bytes. Any `data:...;base64,` prefix is stripped defensively. */
  readonly rawBase64: string;
  /**
   * The document's only durable identity. Open Dental re-materializes the row
   * with a new DocNum the first time someone opens it, so this string — not
   * the returned number — is what a caller records to recognise the send.
   */
  readonly description: string;
  /** `YYYY-MM-DD`. A longer ISO timestamp is truncated to the date part. */
  readonly dateCreated: string;
}

interface RequestSpec {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  /** Anything else — including a 2xx that isn't this one — is a failure. */
  readonly expectStatus: 200 | 201;
  readonly body?: Record<string, unknown>;
  /** Names the operation in error messages, e.g. "the chart note". */
  readonly label: string;
}

const ERROR_BODY_LIMIT = 200;

/**
 * Scrub the keys out of anything we quote back from the API. A 401 body can
 * echo the request's Authorization header, and error messages end up on
 * screen and in bug reports.
 */
function redact(text: string, credentials: OdCredentials): string {
  let scrubbed = text;
  for (const secret of [credentials.developerKey, credentials.customerKey]) {
    if (secret.length > 0) scrubbed = scrubbed.split(secret).join('[redacted]');
  }
  return scrubbed;
}

function detailFrom(body: string, credentials: OdCredentials): string {
  const collapsed = redact(body, credentials).replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '';
  return ` ${collapsed.slice(0, ERROR_BODY_LIMIT)}`;
}

/**
 * A dropped connection or a timeout on a POST is ambiguous: the request may
 * have been applied before the answer was lost. Since nothing can be deleted,
 * a blind retry is how a chart ends up with two of everything.
 */
function retryCaution(spec: RequestSpec): string {
  return spec.method === 'POST'
    ? ' It may still have been filed — check the chart before sending again.'
    : '';
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    // A body we cannot read never changes what the status already told us.
    return '';
  }
}

async function odRequest(
  spec: RequestSpec,
  credentials: OdCredentials,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(`${OD_BASE_URL}${spec.path}`, {
        method: spec.method,
        headers: {
          Authorization: `ODFHIR ${credentials.developerKey}/${credentials.customerKey}`,
          Accept: 'application/json',
          ...(spec.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
        // Patient identity is read back to confirm the target of a permanent
        // write; a cached record could confirm the wrong person.
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      throw timedOut
        ? new OdError(
            'timeout',
            `Open Dental did not respond within ${Math.round(timeoutMs / 1000)}s for ${spec.label}.${retryCaution(spec)}`,
          )
        : new OdError(
            'network',
            `Could not reach Open Dental for ${spec.label}.${retryCaution(spec)}`,
          );
    }

    const body = await readBody(response);
    if (response.status !== spec.expectStatus) {
      throw new OdError(
        'http',
        `Open Dental rejected ${spec.label}.${detailFrom(body, credentials)}`,
        response.status,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * A PatNum that is not a positive whole number would either 404 or, worse,
 * be coerced server-side onto some other patient's chart. Refuse before the
 * request rather than after an undeletable write.
 */
function assertPatNum(patNum: number, label: string): void {
  if (!Number.isInteger(patNum) || patNum <= 0) {
    throw new OdError(
      'http',
      `Refusing to send ${label}: the MRN must be a positive whole number.`,
    );
  }
}

/**
 * Confirms who a note is about to be filed on. Read-only, and the last chance
 * to catch a mistyped MRN while a mistake is still reversible.
 */
export async function getPatient(
  patNum: number,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<OdPatient> {
  assertPatNum(patNum, 'the patient lookup');

  const body = await odRequest(
    { path: `/patients/${patNum}`, method: 'GET', expectStatus: 200, label: 'the patient lookup' },
    credentials,
    fetchImpl,
    timeoutMs,
  );

  const record = parseJson(body);
  if (typeof record !== 'object' || record === null) {
    throw new OdError('http', 'Open Dental returned an unreadable patient record.', 200);
  }
  const fields = record as Record<string, unknown>;
  const lName = typeof fields['LName'] === 'string' ? fields['LName'] : '';
  if (lName.trim().length === 0) {
    // Without a surname there is nothing to confirm the MRN against, which is
    // the entire point of this call.
    throw new OdError('http', 'Open Dental returned a patient record with no name.', 200);
  }

  return {
    PatNum: typeof fields['PatNum'] === 'number' ? fields['PatNum'] : patNum,
    LName: lName,
    FName: typeof fields['FName'] === 'string' ? fields['FName'] : '',
    Birthdate: typeof fields['Birthdate'] === 'string' ? fields['Birthdate'] : '',
  };
}

/** Files the note text as a commlog. Permanent: there is no delete. */
export async function postCommlog(
  input: OdCommlogInput,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<void> {
  assertPatNum(input.patNum, 'the chart note');
  if (input.note.trim().length === 0) {
    throw new OdError('http', 'Refusing to send the chart note: the note is empty.');
  }

  await odRequest(
    {
      path: '/commlogs',
      method: 'POST',
      expectStatus: 201,
      label: 'the chart note',
      body: {
        PatNum: input.patNum,
        CommType: COMM_TYPE_SEDATION_NOTE,
        Mode_: 'None',
        SentOrReceived: 'Sent',
        Note: input.note,
      },
    },
    credentials,
    fetchImpl,
    timeoutMs,
  );
}

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Open Dental wants a bare date; accept a full timestamp and trim it. */
function toApiDate(value: string): string {
  return ISO_DATE_PREFIX.exec(value.trim())?.[1] ?? value.trim();
}

/**
 * Files the note PDF into the patient's Images module. Permanent: DELETE
 * /documents/{DocNum} returns 400 at this practice.
 *
 * The returned DocNum is for this response only — Open Dental defers
 * materialization and re-creates the row under a new DocNum the first time a
 * user opens the document, so it must never be persisted as a handle or
 * looked up later. It is 0 when a 201 response carried no readable body: a
 * 201 means the document exists, and reporting that as a failure would invite
 * the retry that produces a permanent duplicate.
 */
export async function uploadDocument(
  input: OdDocumentInput,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<{ docNum: number }> {
  assertPatNum(input.patNum, 'the note PDF');
  const rawBase64 = toRawBase64(input.rawBase64);
  if (rawBase64.length === 0) {
    throw new OdError('http', 'Refusing to send the note PDF: the file is empty.');
  }
  if (input.description.trim().length === 0) {
    // The description is the only durable way to recognise this document
    // later, so an unnamed upload would be unfindable and undeletable.
    throw new OdError('http', 'Refusing to send the note PDF: the description is empty.');
  }

  const body = await odRequest(
    {
      path: '/documents/Upload',
      method: 'POST',
      expectStatus: 201,
      label: 'the note PDF',
      body: {
        PatNum: input.patNum,
        rawBase64,
        extension: '.pdf',
        Description: input.description,
        DateCreated: toApiDate(input.dateCreated),
        DocCategory: DOC_CATEGORY_IV_SEDATION,
      },
    },
    credentials,
    fetchImpl,
    timeoutMs,
  );

  const parsed = parseJson(body);
  const docNum =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['DocNum']
      : undefined;
  return { docNum: typeof docNum === 'number' && Number.isFinite(docNum) ? docNum : 0 };
}

const DATA_URL_PREFIX = /^data:[^,]*;base64,/i;

/** Accepts either a bare base64 string or a `data:` URL; yields the former. */
export function toRawBase64(value: string): string {
  return value.replace(DATA_URL_PREFIX, '').replace(/\s+/g, '');
}

/**
 * Chunked because a sedation-note PDF runs to hundreds of KB, and spreading
 * that many arguments into String.fromCharCode in one call overflows the
 * stack. Hand-rolled rather than using Buffer: this runs in the browser.
 */
const BASE64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

// -------- Read-only chart history ------------------------------------------
//
// Three list endpoints used to pre-fill the Phase 1 medical history. All are
// GETs: nothing here writes, so unlike the note-filing paths above a failure
// costs the clinician nothing but the offer. Row shapes are deliberately
// loose — Open Dental returns booleans as strings and unset dates as
// "0001-01-01", and normalising that is `chartHistory.ts`'s job, not the
// transport's.

async function odList(
  path: string,
  label: string,
  credentials: OdCredentials,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  const body = await odRequest(
    { path, method: 'GET', expectStatus: 200, label },
    credentials,
    fetchImpl,
    timeoutMs,
  );
  const parsed = parseJson(body);
  // An empty chart legitimately returns `[]`; anything non-array is treated
  // as "nothing recorded" rather than an error, because a malformed list must
  // not present as a clinical fact either way.
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

export function getAllergies(
  patNum: number,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  assertPatNum(patNum, 'the allergy list');
  return odList(
    `/allergies?PatNum=${patNum}`,
    'the allergy list',
    credentials,
    fetchImpl,
    timeoutMs,
  );
}

export function getMedications(
  patNum: number,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  assertPatNum(patNum, 'the medication list');
  return odList(
    `/medicationpats?PatNum=${patNum}`,
    'the medication list',
    credentials,
    fetchImpl,
    timeoutMs,
  );
}

export function getDiseases(
  patNum: number,
  credentials: OdCredentials,
  fetchImpl: FetchLike = browserFetch,
  timeoutMs: number = OD_TIMEOUT_MS,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  assertPatNum(patNum, 'the problem list');
  return odList(
    `/diseases?PatNum=${patNum}`,
    'the problem list',
    credentials,
    fetchImpl,
    timeoutMs,
  );
}
