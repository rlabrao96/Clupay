import { createHmac } from "node:crypto";

/**
 * Sign a set of Flow.cl API request params with HMAC-SHA256.
 *
 * Flow requires params to be sorted alphabetically by key, concatenated
 * as `key1=value1&key2=value2&...`, then signed with the merchant's
 * secret key. The resulting hex digest is appended to the request body
 * as `s=<signature>`.
 *
 * Do NOT include the `s` key in the input to this function — it is the
 * output.
 */
export function signFlowParams(
  params: Record<string, string>,
  secretKey: string
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}
