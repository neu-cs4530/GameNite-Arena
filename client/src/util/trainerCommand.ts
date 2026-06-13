/**
 * Builders for the commands the connect-your-trainer card hands the user.
 * These strings get pasted into a shell, so every interpolated value is
 * quoted defensively — server-minted ids and tokens are normally tame, but
 * a copy-paste surface must not depend on that.
 *
 * Contract (server + kit): GET /api/training/kit/install.sh creates the
 * venv, installs pinned deps, and runs the generic trainer attached to the
 * job when invoked as `sh -s -- --job-id <id> --token <tkn>`; an existing
 * kit attaches with `.venv/bin/python train.py --job-id <id> --token <tkn>`.
 */

/** Values that need no quoting: letters, digits, and -_.:/ only. */
const safeWordPattern = /^[A-Za-z0-9_.:/-]+$/;

/** POSIX-sh single-quoting; embedded quotes via the '\'' dance. */
export function shellQuote(value: string): string {
  if (safeWordPattern.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The one-liner: fetch the kit installer and attach it to this job. */
export function buildBootstrapCommand(origin: string, jobId: string, token: string): string {
  return (
    `curl -fsSL ${origin}/api/training/kit/install.sh | sh -s -- ` +
    `--job-id ${shellQuote(jobId)} --token ${shellQuote(token)}`
  );
}

/** The short path for users who already ran the installer once. */
export function buildKitRunCommand(jobId: string, token: string): string {
  return `.venv/bin/python train.py --job-id ${shellQuote(jobId)} --token ${shellQuote(token)}`;
}

/**
 * Manual fallback, step 1 of 2: mint a training token yourself when the
 * page could not (POST /api/training/token with the withAuth body shape).
 * The password is a placeholder on purpose — it never belongs in copyable
 * page text.
 */
export function buildTokenMintCommand(origin: string, username: string): string {
  const body = `{"auth":{"username":${JSON.stringify(username)},"password":"YOUR_PASSWORD"},"payload":{}}`;
  return (
    `curl -fsS -X POST ${origin}/api/training/token ` +
    `-H 'Content-Type: application/json' -d ${shellQuote(body)}`
  );
}
