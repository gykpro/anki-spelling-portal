const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type GeneratedPng = {
  base64: string;
  mimeType: "image/png";
};

function isTransientStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

function retryDelayMs(response: Response): number {
  const raw = response.headers.get("Retry-After")?.trim();
  if (!raw) return DEFAULT_RETRY_DELAY_MS;

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    const milliseconds = seconds * 1000;
    return Number.isSafeInteger(seconds) && milliseconds <= 2_147_483_647
      ? milliseconds
      : DEFAULT_RETRY_DELAY_MS;
  }

  if (
    /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      raw
    )
  ) {
    const retryAt = Date.parse(raw);
    if (!Number.isNaN(retryAt) && new Date(retryAt).toUTCString() === raw) {
      const milliseconds = Math.max(0, retryAt - Date.now());
      return milliseconds <= 2_147_483_647
        ? milliseconds
        : DEFAULT_RETRY_DELAY_MS;
    }
  }

  return DEFAULT_RETRY_DELAY_MS;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCompletePngStructure(bytes: Buffer): boolean {
  let offset = PNG_SIGNATURE.length;
  let sawIhdr = false;
  let sawImageData = false;

  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const chunkTypeBytes = bytes.subarray(offset + 4, offset + 8);
    if (
      !chunkTypeBytes.every(
        (byte) =>
          (byte >= 0x41 && byte <= 0x5a) ||
          (byte >= 0x61 && byte <= 0x7a)
      )
    ) {
      return false;
    }
    const chunkType = chunkTypeBytes.toString("latin1");
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.length) return false;

    if (!sawIhdr) {
      if (chunkType !== "IHDR" || dataLength !== 13) return false;
      sawIhdr = true;
    } else if (chunkType === "IHDR") {
      return false;
    }

    if (chunkType === "IDAT" && dataLength > 0) {
      sawImageData = true;
    }

    if (chunkType === "IEND") {
      return dataLength === 0 && sawImageData && chunkEnd === bytes.length;
    }

    offset = chunkEnd;
  }

  return false;
}

export function assertValidPngBase64(base64: unknown): asserts base64 is string {
  if (typeof base64 !== "string" || base64.trim().length === 0) {
    throw new Error("OpenAI image API returned no image data");
  }

  const normalized = base64.trim();
  if (base64 !== normalized) {
    throw new Error("OpenAI image API returned non-canonical base64 image data");
  }
  const isCanonicalBase64 =
    normalized.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      normalized
    );
  if (!isCanonicalBase64) {
    throw new Error("OpenAI image API returned invalid base64 image data");
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.toString("base64") !== normalized) {
    throw new Error("OpenAI image API returned non-canonical base64 image data");
  }
  const hasPngSignature =
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);

  if (!hasPngSignature || !hasCompletePngStructure(bytes)) {
    throw new Error("OpenAI image API returned invalid PNG data");
  }
}

type ProviderAttempt = {
  response: Response;
  payload?: unknown;
  invalidJson: boolean;
};

async function performRequest(
  prompt: string,
  apiKey: string
): Promise<ProviderAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_IMAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
      }),
    });

    if (!response.ok) {
      return { response, invalidJson: false };
    }

    try {
      const payload = await response.json();
      return { response, payload, invalidJson: false };
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (error instanceof SyntaxError) {
        return { response, invalidJson: true };
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestOpenAIImage(
  prompt: string,
  apiKey: string
): Promise<GeneratedPng> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let providerAttempt: ProviderAttempt;
    try {
      providerAttempt = await performRequest(prompt, apiKey);
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await wait(DEFAULT_RETRY_DELAY_MS);
        continue;
      }

      throw new Error("OpenAI image API network error");
    }

    const { response, payload, invalidJson } = providerAttempt;

    if (!response.ok) {
      const error = new Error(`OpenAI image API error ${response.status}`);
      if (attempt < MAX_ATTEMPTS && isTransientStatus(response.status)) {
        await wait(retryDelayMs(response));
        continue;
      }
      throw error;
    }

    if (invalidJson) {
      throw new Error("OpenAI image API returned an invalid image response");
    }

    const base64 = (payload as { data?: { b64_json?: unknown }[] })?.data?.[0]
      ?.b64_json;
    assertValidPngBase64(base64);
    return { base64: base64.trim(), mimeType: "image/png" };
  }

  throw new Error("OpenAI image API request failed");
}
