/**
 * Secret Manager bills per active secret version, so the hand-managed
 * credentials ship as a single JSON blob in `APP_SECRETS` rather than one
 * secret each (see `infra/secrets.tf`). This expands the blob back into a flat
 * key/value map, so `loadEnvironmentConfig` and everything downstream keep
 * seeing plain `TMDB_API_KEY`-style keys and know nothing about the packing.
 *
 * Real env vars win over blob entries, which covers both directions:
 * locally there's no `APP_SECRETS` and `backend/.env` supplies the keys
 * directly, and in prod a single value can be overridden on a revision
 * without rewriting the whole blob.
 *
 * `MONGO_URL` stays a standalone secret env var — Terraform generates it, so
 * it can't be part of the blob.
 */
export function resolveEnv(env: { [key: string]: string | undefined }): {
  [key: string]: string | undefined;
} {
  const blob = env["APP_SECRETS"];
  if (!blob) {
    return { ...env };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch (cause) {
    // Deliberately fatal: a malformed blob means every credential is missing,
    // and failing at startup beats each provider 401-ing later on.
    throw new Error(
      `APP_SECRETS is not valid JSON: ${(cause as Error).message}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("APP_SECRETS must be a JSON object of KEY/value pairs");
  }

  const unpacked: { [key: string]: string | undefined } = {};
  for (const [key, value] of Object.entries(parsed)) {
    unpacked[key] = value == null ? undefined : String(value);
  }

  return { ...unpacked, ...env };
}
