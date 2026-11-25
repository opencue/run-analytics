SELECT
    properties.product AS product,
    count() AS runs,
    countIf(properties.outcome = 'failure') AS failed,
    round(100.0 * countIf(properties.outcome = 'success') / count(), 1) AS success_pct,
    round(quantile(0.5)(toFloat(properties.duration_ms))) AS p50_ms,
    round(quantile(0.95)(toFloat(properties.duration_ms))) AS p95_ms,
    countIf(isNotNull(properties.input_tokens)) AS runs_with_input_tokens,
    sum(toInt(properties.input_tokens)) AS total_input_tokens,
    countIf(isNotNull(properties.output_tokens)) AS runs_with_output_tokens,
    sum(toInt(properties.output_tokens)) AS total_output_tokens
FROM events
WHERE event = 'opencue_run_completed'
    AND properties.schema_version = 1
    AND properties.product IN ('gitguardex', 'cue')
    AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY product
ORDER BY product
