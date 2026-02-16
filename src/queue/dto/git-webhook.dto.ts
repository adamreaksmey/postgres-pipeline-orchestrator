/**
 * Git webhook payload (e.g. GitHub/GitLab push).
 * Used to match a pipeline (repo) and stored as pipeline_runs.trigger_metadata.
 */
export interface GitWebhookPayload {
  /** Repository URL or identifier; used to resolve pipeline by pipelines.repository */
  repo: string;
  /** Full ref, e.g. refs/heads/main */
  ref?: string;
  /** Branch name, e.g. main (or derived from ref) */
  branch?: string;
  /** Commit SHA */
  commit?: string;
  /** Commit message */
  message?: string;
  /** Author display name or email */
  author?: string;
  /** Author details (e.g. GitHub sender) */
  author_email?: string;
  /** Arbitrary extra fields for trigger_metadata */
  [key: string]: unknown;
}
