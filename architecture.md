# Architecture and operational notes

## Data flow

1. Two Apify tasks search public Threads results and output post records.
2. An Apify `ACTOR.RUN.SUCCEEDED` webhook sends the dataset ID to the Worker endpoint `POST /apify-webhook`.
3. The Worker checks the secret header, obtains up to 100 dataset items with an API token, and validates candidate posts.
4. Filtering rejects reply records (`is_reply` must explicitly equal `false`), paid partnership flags, non-Threads URLs, malformed timestamps, posts older than 2 hours, and text rejected by classification rules.
5. Accepted URLs are inserted with `INSERT OR IGNORE` into `posts_queue` in Cloudflare D1. The URL is the deduplication key.
6. A Cron Trigger invokes the Worker every 30 minutes; it prioritizes direct requests above potential requests and sends at most eight pending items.
7. A `notification_control` row guards against duplicate digests within a 30-minute window. On successful Telegram delivery, the queue rows are marked sent.

## Schedules and cost controls

- Direct-intent search: every 15 minutes (`*/15 * * * *`).
- Problem-signal search: every 30 minutes (`*/30 * * * *`).
- Each task uses a rolling 60-minute search window, `onlyNew=true`, and a 20-result output cap.
- The actor is billed per output post. Configure the run cost ceiling in the Apify console rather than embedding secrets or account-specific limits here.
- Reduced schedule frequency does not guarantee proportional cost savings; returned result counts matter.

## Scope and limitations

- Current implementation uses heuristic text patterns and does not call any language model.
- The Worker classifies full post text at ingestion, but D1 stores only the first 240 characters; digest-time reclassification uses the excerpt, which may differ on long posts.
- D1 does not store the `is_reply` flag. Existing records inserted by an older Worker version cannot be retroactively verified as original posts.
- The backlog query checks at most 100 pending items and prioritizes up to eight for a digest; invalid pending rows are not automatically deleted.
- The Worker does not emit per-filter rejection statistics; logs can verify endpoint execution, not individual classification decisions.
- D1 currently removes queue entries older than 7 days, including sent records, so deduplication is bounded.

## Security practices

Keep the Apify API token, webhook signing secret, Telegram bot token, Telegram chat ID, and live D1 exports out of Git. Do not put account-scoped identifiers, private post text, or billing screenshots in portfolio artifacts. Prefer a separate staging environment before automated GitHub-to-Cloudflare deployment.
