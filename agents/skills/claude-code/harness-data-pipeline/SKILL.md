# Harness Data Pipeline

> Verify ETL/ELT pipeline quality, data contracts, idempotency, and test coverage. Analyzes DAG structure, transformation logic, and data quality checks across dbt, Airflow, Dagster, and Prefect pipelines.

## When to Use

- When reviewing a PR that modifies pipeline definitions, DAGs, or transformation logic
- When adding new data sources or sinks to an existing pipeline
- When data quality issues surface and pipeline validation needs auditing
- NOT for database schema design or migration review (use harness-database)
- NOT for SQL query optimization within pipelines (use harness-sql-review)
- NOT for infrastructure provisioning of pipeline runners (use harness-infrastructure-as-code)

## Process

### Phase 1: DETECT -- Identify Pipeline Framework and Structure

1. **Resolve project root.** Use provided path or cwd.

2. **Detect pipeline framework.** Scan for framework indicators:
   - **dbt:** `dbt_project.yml`, `profiles.yml`, `models/` with `.sql` files, `macros/`
   - **Airflow:** `dags/` directory, files importing `from airflow`, `airflow.cfg`
   - **Dagster:** `dagster/` directory, files importing `from dagster`, `workspace.yaml`
   - **Prefect:** files importing `from prefect`, `prefect.yaml`, `flows/`
   - **Custom:** `pipelines/`, `etl/`, `src/**/transforms/**` without known framework markers

3. **Map DAG structure.** For the detected framework:
   - **dbt:** Parse `ref()` and `source()` calls to build the model dependency graph
   - **Airflow:** Parse `>>` operators and `set_downstream/set_upstream` calls to build task dependencies
   - **Dagster:** Parse `@asset` decorators and `deps` parameters to build the asset graph
   - **Prefect:** Parse `@flow` and `@task` decorators to build the flow graph

4. **Identify data sources and sinks.** Catalog:
   - Source systems (databases, APIs, file systems, message queues)
   - Sink targets (data warehouses, data lakes, downstream services)
   - Intermediate staging areas

5. **Detect configuration.** Read pipeline configuration for:
   - Schedule/cron definitions
   - Retry policies and timeout settings
   - Environment-specific overrides (dev, staging, production)
   - Secret references and connection strings

6. **Report detection summary:**
   ```
   Framework: dbt 1.7 + Airflow 2.8
   Models: 45 dbt models (12 staging, 18 intermediate, 15 mart)
   DAGs: 3 Airflow DAGs (daily-etl, hourly-metrics, weekly-reports)
   Sources: 2 PostgreSQL databases, 1 S3 bucket, 1 Stripe API
   Sinks: BigQuery (analytics warehouse)
   ```

---

### Phase 2: ANALYZE -- Evaluate Pipeline Patterns

1. **Check idempotency.** For each pipeline/model:
   - Does the transformation produce the same result when run multiple times?
   - Are there `INSERT` operations without corresponding `DELETE` or `MERGE` logic?
   - Are dbt models using `incremental` materialization with proper `unique_key`?
   - Do Airflow tasks use idempotent operators or handle re-runs gracefully?

2. **Check error handling.** Evaluate:
   - Are failed tasks retried with backoff? (Airflow: `retries`, `retry_delay`; Prefect: `retries`, `retry_delay_seconds`)
   - Is there alerting on pipeline failure? (Slack, PagerDuty, email callbacks)
   - Are partial failures handled? (Can the pipeline resume from the point of failure?)
   - Are dead-letter queues or error tables configured for unprocessable records?

3. **Check data contracts.** Verify schema enforcement:
   - Are source schemas validated before transformation? (dbt: `source` tests; custom: schema validation)
   - Are output schemas enforced? (dbt: `contracts`; custom: schema assertions)
   - Are breaking changes to source schemas detected? (freshness checks, schema drift detection)
   - Are there column-level descriptions and documentation?

4. **Check pipeline dependencies.** Analyze the DAG for:
   - Circular dependencies (error: pipeline cannot complete)
   - Overly long critical paths (warning: bottleneck risk)
   - Disconnected subgraphs (info: may indicate orphaned pipelines)
   - Fan-out bottlenecks (one task blocking many downstream tasks)

5. **Check freshness and SLAs.** Evaluate:
   - Are `freshness` checks defined for sources? (dbt: `loaded_at_field`, `warn_after`, `error_after`)
   - Are pipeline SLAs defined? (Airflow: `sla` parameter)
   - Do SLAs match business requirements?
   - Is there monitoring for SLA breaches?

6. **Classify findings by severity:**
   - **Error:** Non-idempotent writes, circular dependencies, missing error handling for production DAGs
   - **Warning:** Missing freshness checks, no retry policy, missing data contracts
   - **Info:** Undocumented models, missing column descriptions, suboptimal materialization strategy

---

### Phase 3: VALIDATE -- Check Data Quality and Test Coverage

1. **Audit existing data tests.** For each framework:
   - **dbt:** Count tests per model (`unique`, `not_null`, `accepted_values`, `relationships`, custom)
   - **Airflow:** Check for data validation tasks in DAGs
   - **Dagster:** Check for `@asset_check` decorators and `check_specs`
   - **Custom:** Look for assertion functions, validation scripts, or test files

2. **Calculate test coverage.** Measure:
   - Models/tasks with zero tests (critical gap)
   - Models with only generic tests (not_null, unique) but no business logic tests
   - Primary key coverage: does every model test uniqueness on its grain?
   - Referential integrity: are foreign key relationships tested?

3. **Check for missing critical tests.** Flag models that should have specific tests:
   - Revenue/financial models: must have row count variance checks and sum validation
   - User-facing models: must have not_null on required display fields
   - Incremental models: must have uniqueness test on the incremental key
   - Models with `WHERE` clauses: must have tests verifying the filter logic

4. **Validate pipeline testability.** Assess:
   - Can pipelines run in a test environment with mock data?
   - Are there integration tests that run the full pipeline on sample datasets?
   - Is there a CI pipeline that runs dbt tests / DAG validation on every PR?

5. **Check for data quality patterns:**
   - Row count anomaly detection (sudden drops or spikes)
   - Schema drift detection (new columns, type changes)
   - Null rate monitoring (percentage of nulls exceeding threshold)
   - Value distribution monitoring (categorical values outside expected set)

---

### Phase 4: DOCUMENT -- Generate Pipeline Documentation

1. **Generate pipeline lineage report.** Produce a text-based lineage visualization:

   ```
   source.stripe.payments
     -> stg_payments (staging, view)
       -> int_payments_enriched (intermediate, table)
         -> mart_revenue_daily (mart, incremental)
           -> [exposed to: Looker dashboard, finance API]
   ```

2. **Generate quality check report.** Summarize test coverage and findings:

   ```
   Pipeline Quality Report: [PASS/NEEDS_ATTENTION/FAIL]
   Models: 45 total
   Test coverage: 78% (35/45 models have tests)
   Critical gaps: 3 models with zero tests (mart_revenue_daily, stg_users, int_orders)
   Data contracts: 12/15 mart models have contracts
   Freshness checks: 4/6 sources have freshness monitoring

   ERRORS:
   [DP-ERR-001] models/marts/mart_revenue_daily.sql
     Non-idempotent: uses INSERT without MERGE or DELETE+INSERT pattern
   [DP-ERR-002] dags/daily_etl.py
     No retry policy: tasks will not retry on transient failures

   WARNINGS:
   [DP-WARN-001] models/staging/stg_users.sql
     Zero tests: no data quality checks on user staging model
   [DP-WARN-002] sources.yml
     Missing freshness: stripe.payments source has no freshness check
   ```

3. **Generate missing documentation.** For undocumented models:
   - Create `schema.yml` entries with inferred column descriptions
   - Add model descriptions based on SQL logic analysis
   - Document source-to-mart lineage

4. **Produce remediation checklist.** Prioritized list of actions:

   ```
   Priority 1 (errors):
   [ ] Fix mart_revenue_daily to use MERGE for idempotency
   [ ] Add retry policy to daily_etl DAG tasks

   Priority 2 (warnings):
   [ ] Add not_null and unique tests to stg_users
   [ ] Add freshness check to stripe.payments source

   Priority 3 (info):
   [ ] Add column descriptions to 12 undocumented models
   [ ] Document the weekly-reports DAG purpose and schedule
   ```

---

## Harness Integration

- **`harness skill run harness-data-pipeline`** -- Primary command for pipeline quality auditing.
- **`harness validate`** -- Run after applying pipeline changes to verify project health.
- **`Glob`** -- Used to locate DAG files, model definitions, configuration files, and test specifications.
- **`Grep`** -- Used to find `ref()` calls, `source()` references, operator chains, and test definitions.
- **`Read`** -- Used to read pipeline definitions, SQL models, configuration files, and test results.
- **`Write`** -- Used to generate documentation stubs, schema.yml entries, and quality reports.
- **`Bash`** -- Used to run `dbt ls`, `dbt test --dry-run`, or parse DAG structures.
- **`emit_interaction`** -- Used to present the quality report and confirm remediation priorities.

## Success Criteria

- Pipeline framework is correctly detected with full DAG structure mapped
- Every model/task is evaluated for idempotency, error handling, and data contracts
- Test coverage percentage is calculated with critical gaps identified
- Lineage is documented from source to mart/exposure
- Findings are classified by severity with specific remediation steps
- Quality report follows structured format suitable for team review

## Examples

### Example: dbt Project with BigQuery Warehouse

```
Phase 1: DETECT
  Framework: dbt 1.7.4 (dbt-bigquery adapter)
  Models: 52 (15 staging, 22 intermediate, 15 mart)
  Sources: 3 (PostgreSQL replica, Stripe API via Fivetran, Google Sheets)
  Target: BigQuery dataset `analytics`

Phase 2: ANALYZE
  [DP-ERR-001] models/marts/mart_subscriptions.sql
    Incremental model missing unique_key -- will create duplicates on re-run
  [DP-WARN-001] 4 sources missing freshness checks
  [DP-WARN-002] No retry configuration in dbt Cloud job settings

Phase 3: VALIDATE
  Test coverage: 71% (37/52 models)
  Critical gaps: mart_revenue (no tests), mart_subscriptions (no uniqueness test)
  Primary key coverage: 80% (missing on 3 intermediate models)

Phase 4: DOCUMENT
  Generated: lineage report for all 52 models
  Generated: schema.yml stubs for 8 undocumented models
  Quality Report: NEEDS_ATTENTION (1 error, 4 warnings)
```

### Example: Airflow DAGs with S3-to-Snowflake Pipeline

```
Phase 1: DETECT
  Framework: Apache Airflow 2.8.1
  DAGs: 5 (s3_ingest_daily, transform_orders, aggregate_metrics, export_reports, cleanup)
  Sources: S3 buckets (raw-events, partner-feeds), PostgreSQL
  Sinks: Snowflake (ANALYTICS schema), S3 (processed-exports)

Phase 2: ANALYZE
  [DP-ERR-001] dags/s3_ingest_daily.py
    S3KeySensor has no timeout -- will block the scheduler indefinitely
  [DP-ERR-002] dags/transform_orders.py
    PythonOperator writes to Snowflake without transaction -- partial writes on failure
  [DP-WARN-001] dags/cleanup.py
    No SLA defined -- cleanup failures could go unnoticed for days
  [DP-INFO-001] All DAGs use default_args but 2 override retries to 0

Phase 3: VALIDATE
  DAG validation: all 5 parse without errors
  Data validation tasks: present in 3/5 DAGs
  Missing: no validation in s3_ingest_daily (raw data accepted without checks)

Phase 4: DOCUMENT
  Generated: DAG dependency diagram
  Generated: runbook for each DAG with schedule, dependencies, and failure recovery
  Quality Report: FAIL (2 errors requiring immediate attention)
```

## Rationalizations to Reject

| Rationalization                                                                                                                   | Reality                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The pipeline failed halfway through — we'll just re-run it and it'll pick up where it left off."                                 | A non-idempotent pipeline that is re-run from the middle writes duplicate records for the portion that succeeded before failure. The correct fix is to make the pipeline idempotent (MERGE, upsert, or delete-then-insert) so re-runs are always safe, not to assume partial re-runs are harmless. |
| "The model has no dbt tests yet, but it's only used in one dashboard — low risk."                                                 | Every untested model is a silent data quality failure waiting to reach a stakeholder. Revenue and user-facing models require test coverage regardless of how few consumers they have today. The number of consumers grows; the coverage does not add itself retroactively.                         |
| "We're still figuring out the schema — we'll add data contracts once the model stabilizes."                                       | Contracts are most valuable during schema evolution, not after it. An unstable schema without a contract lets breaking changes propagate undetected to downstream consumers. Add the contract as the model is defined; update it explicitly as the schema changes. That explicitness is the value. |
| "Circular dependency detection is handled by the orchestrator — I don't need to check for it during design."                      | Orchestrators detect circular dependencies at runtime, after the DAG has been deployed. Static analysis during design catches them before deployment, before the pipeline fails at 3am, and before engineers have to diagnose a graph cycle under pressure. Detect them early.                     |
| "The freshness check is too strict — it keeps alerting because the upstream source is occasionally delayed. I'll just remove it." | A freshness check that fires too often has the wrong threshold. Removing it means stale data reaches analysts silently. Adjust the `warn_after` and `error_after` thresholds to match the source's actual SLA, and escalate if the source cannot meet its own SLA.                                 |

## Gates

- **No approving non-idempotent production pipelines.** If a pipeline writes data without MERGE, upsert, or delete-then-insert patterns, it is flagged as an error. Non-idempotent pipelines cause data duplication on re-runs.
- **No ignoring circular dependencies.** Circular dependencies in the DAG mean the pipeline cannot complete. This is always an error, never a warning.
- **No passing pipelines with zero test coverage on financial models.** Models that feed revenue reports, billing, or financial dashboards must have data quality tests. Zero coverage on these models is an error.
- **No generating documentation that misrepresents lineage.** If the lineage cannot be confidently traced (e.g., dynamic SQL, runtime-generated table names), mark it as "unresolved" rather than guessing.

## Escalation

- **When pipeline logic uses dynamic SQL or runtime table names:** Flag that lineage cannot be statically analyzed: "This model uses `{{ var('target_table') }}` which resolves at runtime. Manual lineage documentation is required."
- **When data quality issues indicate upstream source problems:** Do not attempt to fix source data. Report: "Source `stripe.payments` has 15% null `customer_id` values. This is a source data quality issue -- coordinate with the data provider."
- **When pipeline SLAs conflict with infrastructure capacity:** If the pipeline takes longer than its schedule interval, flag the scheduling conflict: "daily_etl takes ~4 hours but is scheduled every 2 hours. This will cause overlapping runs."
- **When migration from one framework to another is in progress:** If both Airflow and Dagster artifacts exist, ask for clarification rather than analyzing both: "Found both Airflow DAGs and Dagster assets. Which framework should be audited? Is a migration in progress?"
