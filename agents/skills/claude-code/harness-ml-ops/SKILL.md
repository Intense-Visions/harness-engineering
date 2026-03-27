# Harness ML Ops

> Advise on ML pipeline management, experiment tracking hygiene, model serving patterns, and prompt evaluation frameworks. Audits reproducibility, model versioning, and deployment readiness across MLflow, Weights and Biases, SageMaker, and Vertex AI.

## When to Use

- When setting up or auditing ML infrastructure (experiment tracking, model registry, serving)
- When adding a new model or prompt pipeline and need deployment pattern guidance
- When experiment tracking is inconsistent and reproducibility is at risk
- NOT for data pipeline ETL patterns (use harness-data-pipeline)
- NOT for SQL query optimization in feature engineering (use harness-sql-review)
- NOT for infrastructure provisioning of GPU instances (use harness-infrastructure-as-code)

## Process

### Phase 1: DETECT -- Identify ML Stack and Artifacts

1. **Resolve project root.** Use provided path or cwd.

2. **Detect ML frameworks and tools.** Scan for:
   - **Experiment tracking:** `mlflow/`, `mlruns/`, `wandb/`, `mlflow.log_param`, `wandb.init`, `wandb.log`
   - **Model frameworks:** `torch`, `tensorflow`, `sklearn`, `xgboost`, `transformers`, `langchain`, `openai`
   - **Serving:** `Dockerfile` with model references, `serve.py`, `predict.py`, `app.py` with `/predict` routes, BentoML, TorchServe, TensorFlow Serving configs
   - **Evaluation:** `evals/`, `prompts/`, `eval_config.yaml`, files with `evaluate`, `benchmark`, `metrics`
   - **Notebooks:** `*.ipynb` files, `notebooks/` directory
   - **Feature stores:** Feast config, Tecton, Hopsworks references

3. **Inventory model artifacts.** Locate and catalog:
   - Trained model files: `*.pt`, `*.pth`, `*.h5`, `*.pkl`, `*.onnx`, `*.safetensors`
   - Model configuration: `config.json`, `model_config.yaml`, hyperparameter files
   - Prompt templates: `prompts/`, `*.prompt`, template strings with `{variable}` interpolation
   - Evaluation datasets: `evals/`, `test_data/`, golden sets, benchmark datasets

4. **Detect model registry usage.** Check for:
   - MLflow Model Registry: `mlflow.register_model`, model stages (Staging, Production, Archived)
   - Weights and Biases Artifacts: `wandb.Artifact`, model versioning
   - SageMaker Model Registry: `sagemaker.register_model_step`
   - Hugging Face Hub: `push_to_hub`, `from_pretrained` with custom models
   - Custom registry: version-tagged model directories, model metadata files

5. **Map the ML lifecycle.** Identify which stages are present:
   - Data preparation and feature engineering
   - Training / fine-tuning
   - Experiment tracking and comparison
   - Model evaluation and validation
   - Model registration and versioning
   - Deployment and serving
   - Monitoring and retraining triggers

6. **Report detection summary:**
   ```
   ML Stack Detection:
   Frameworks: PyTorch 2.1, Hugging Face Transformers 4.36
   Tracking: MLflow 2.10 (local tracking server)
   Serving: FastAPI + TorchServe
   Models: 3 fine-tuned transformers, 1 XGBoost classifier
   Prompts: 12 templates in prompts/ (LangChain format)
   Evaluation: 2 eval configs, 1 golden dataset
   Registry: MLflow (2 models registered, 1 in Production stage)
   Missing stages: monitoring, automated retraining
   ```

---

### Phase 2: ANALYZE -- Evaluate ML Practices

1. **Check experiment tracking hygiene.** Evaluate:
   - Are all training runs logged? (check for `mlflow.autolog()` or manual `log_param`/`log_metric`)
   - Are hyperparameters fully captured? (learning rate, batch size, epochs, model architecture)
   - Are data versions tracked? (dataset hash, split ratios, preprocessing version)
   - Are environment details logged? (Python version, package versions, GPU type)
   - Are artifacts (model weights, configs) stored with experiments?
   - Flag: training scripts that produce models without experiment logging

2. **Check reproducibility.** Verify:
   - Are random seeds set and logged? (`torch.manual_seed`, `np.random.seed`, `random.seed`)
   - Are data loading pipelines deterministic? (shuffling with seed, consistent splits)
   - Are package versions pinned? (`requirements.txt` with versions, `poetry.lock`, `pip freeze`)
   - Can an experiment be re-run from its logged parameters to reproduce the result?
   - Are there notebooks with unexecuted cells or out-of-order execution?

3. **Check model serving patterns.** Evaluate:
   - Is the model loaded once at startup or per-request? (per-request loading is an error)
   - Are inference inputs validated? (schema, type checking, bounds checking)
   - Is batching implemented for throughput? (batch inference for non-real-time use cases)
   - Is there a health check endpoint? (`/health`, `/ready`)
   - Is model versioning reflected in the serving API? (A/B testing, canary deployment)
   - Are timeout and resource limits configured?

4. **Check prompt management (for LLM applications).** Evaluate:
   - Are prompts version-controlled? (not hardcoded in application code)
   - Are prompt templates parameterized? (using `{variable}` not string concatenation)
   - Is there prompt-response logging for debugging?
   - Are there guardrails for prompt injection? (input sanitization, output validation)
   - Are token costs estimated and budgeted?

5. **Check evaluation coverage.** Evaluate:
   - Are there evaluation datasets with known-good outputs (golden sets)?
   - Are multiple metrics tracked? (not just accuracy -- precision, recall, F1, latency)
   - For LLM applications: are there automated eval suites? (factual accuracy, hallucination detection, safety)
   - Is there regression testing? (new model vs production model comparison)
   - Are evaluation results versioned alongside model versions?

6. **Classify findings by severity:**
   - **Error:** Model loaded per-request, no experiment tracking on training, no evaluation before deployment
   - **Warning:** Missing reproducibility controls, incomplete metric logging, no golden set
   - **Info:** Missing monitoring, suboptimal batching, notebook ordering issues

---

### Phase 3: DESIGN -- Recommend Improvements

1. **Recommend experiment tracking setup.** Based on the detected framework:
   - **MLflow not configured:** Provide `mlflow.set_tracking_uri()` and `mlflow.autolog()` setup
   - **W&B not configured:** Provide `wandb.init(project=...)` and `wandb.config` setup
   - **Tracking present but incomplete:** List specific parameters and metrics to add

2. **Recommend model registry workflow.** Design a versioning and promotion flow:

   ```
   Training -> Candidate (auto-registered)
     -> Evaluation gate (metrics threshold)
       -> Staging (shadow deployment)
         -> Production (canary rollout)
           -> Archived (previous version)
   ```

   Adapt to the project's scale: small projects may skip staging/canary.

3. **Recommend evaluation framework.** Based on model type:
   - **Classification:** confusion matrix, precision/recall by class, calibration curve
   - **Regression:** MAE, RMSE, residual distribution
   - **LLM/generative:** factual accuracy, relevance scoring, safety checks, latency per token
   - **Recommendation:** hit rate, NDCG, coverage, diversity
     Provide example evaluation config for the detected framework.

4. **Recommend prompt management patterns.** For LLM applications:
   - Separate prompt templates from application code into `prompts/` directory
   - Version prompts alongside evaluation results
   - Implement A/B testing for prompt variants
   - Add guardrails: input length limits, output validation, PII filtering

5. **Recommend monitoring and retraining triggers.** Design:
   - Data drift detection (input distribution monitoring)
   - Model performance degradation alerts (metric thresholds)
   - Automated retraining pipeline triggers
   - Cost monitoring for API-based models (token usage, request volume)

6. **Provide implementation templates.** Generate starter code for:
   - Experiment tracking wrapper (standardized logging across the project)
   - Model serving boilerplate (FastAPI with health check, input validation, batching)
   - Evaluation harness (test runner with golden set comparison)

---

### Phase 4: VALIDATE -- Verify Deployment Readiness

1. **Check deployment checklist.** Verify each item:
   - [ ] Model is registered in the model registry with a version tag
   - [ ] Evaluation metrics meet the defined threshold (or threshold is documented)
   - [ ] Serving endpoint has health check and input validation
   - [ ] Model is not loaded per-request
   - [ ] Resource requirements are documented (memory, GPU, latency budget)
   - [ ] Rollback procedure exists (previous model version can be restored)
   - [ ] Monitoring is configured (or explicitly deferred with rationale)

2. **Check for common deployment pitfalls:**
   - Model file is committed to git (should be in artifact store)
   - API keys or credentials in model config (should use secrets manager)
   - Hardcoded file paths that differ between dev and production
   - Missing CORS or authentication on inference endpoints
   - No rate limiting on public-facing inference APIs

3. **Validate prompt safety (for LLM applications).** Check:
   - Are system prompts protected from user override?
   - Is there input sanitization before prompt injection?
   - Are output filters in place for PII, toxicity, and hallucination?
   - Are token limits enforced per request?

4. **Output ML readiness report:**

   ```
   ML Ops Report: [READY/NEEDS_ATTENTION/NOT_READY]
   Stack: PyTorch + MLflow + FastAPI
   Models: 3 detected, 1 registered in Production
   Experiment tracking: 85% coverage (2 training scripts missing logging)
   Reproducibility: PARTIAL (seeds set, packages not pinned)
   Evaluation: 1/3 models have golden set evaluation
   Serving: health check present, input validation missing

   ERRORS:
   [ML-ERR-001] src/serve.py:12
     Model loaded inside request handler -- move to startup event
   [ML-ERR-002] training/train_classifier.py
     No experiment tracking -- results are not reproducible

   WARNINGS:
   [ML-WARN-001] requirements.txt
     Package versions not pinned (torch, transformers)
   [ML-WARN-002] evals/
     Only accuracy metric tracked -- add precision, recall, F1

   RECOMMENDATIONS:
   1. Add mlflow.autolog() to train_classifier.py
   2. Pin package versions in requirements.txt
   3. Move model loading to FastAPI lifespan event
   4. Add input validation schema to /predict endpoint
   ```

5. **Verify report accuracy.** Cross-check:
   - Do referenced files exist at the stated paths?
   - Do error findings match actual code patterns?
   - Are recommendations actionable with the detected framework?

---

## Harness Integration

- **`harness skill run harness-ml-ops`** -- Primary command for ML operations auditing.
- **`harness validate`** -- Run after applying recommendations to verify project health.
- **`Glob`** -- Used to locate model artifacts, experiment configs, notebooks, prompt templates, and evaluation datasets.
- **`Grep`** -- Used to find experiment logging calls, model loading patterns, and serving endpoint definitions.
- **`Read`** -- Used to read training scripts, serving code, evaluation configs, and model metadata.
- **`Write`** -- Used to generate experiment tracking wrappers, serving boilerplate, and evaluation harness templates.
- **`Bash`** -- Used to check MLflow tracking server status, validate model registry entries, and run lightweight eval checks.
- **`emit_interaction`** -- Used to present the readiness report and confirm recommendations before generating implementation templates.

## Success Criteria

- ML stack is fully detected with framework versions and artifact locations
- Experiment tracking coverage is measured across all training scripts
- Reproducibility gaps are identified with specific remediation steps
- Model serving patterns are evaluated for correctness and performance
- Evaluation coverage is assessed with metric completeness
- Prompt management is audited for safety and version control (for LLM applications)
- Deployment readiness checklist produces a clear go/no-go assessment

## Examples

### Example: PyTorch Fine-Tuning Pipeline with MLflow

```
Phase 1: DETECT
  Frameworks: PyTorch 2.1, Hugging Face Transformers 4.36
  Tracking: MLflow 2.10 (local, 47 runs logged)
  Models: 2 fine-tuned BERT models in mlruns/
  Notebooks: 3 in notebooks/ (exploration, training, evaluation)

Phase 2: ANALYZE
  [ML-WARN-001] notebooks/training.ipynb
    Cells executed out of order (cell 7 before cell 5) -- not reproducible
  [ML-WARN-002] training/finetune.py
    Random seed set for torch but not for numpy or python random
  [ML-INFO-001] MLflow runs missing GPU type metadata

Phase 3: DESIGN
  Recommended: Add np.random.seed() and random.seed() alongside torch.manual_seed()
  Recommended: Add mlflow.log_param("gpu_type", torch.cuda.get_device_name())
  Generated: training/experiment_wrapper.py (standardized logging)

Phase 4: VALIDATE
  Deployment readiness: NEEDS_ATTENTION
  Model registered: YES (bert-sentiment-v2 in Production)
  Evaluation: golden set present with 500 examples
  Missing: automated regression test comparing v2 vs v1
```

### Example: LangChain Application with OpenAI

```
Phase 1: DETECT
  Frameworks: LangChain 0.1, OpenAI API (GPT-4)
  Prompts: 8 templates in src/prompts/ (hardcoded as Python strings)
  Evaluation: none detected
  Serving: FastAPI with /chat and /summarize endpoints

Phase 2: ANALYZE
  [ML-ERR-001] src/prompts/summarize.py
    Prompt template uses string concatenation with user input -- injection risk
  [ML-ERR-002] src/api/chat.py
    No token limit enforcement -- single request could consume entire budget
  [ML-WARN-001] No evaluation framework -- model changes deployed without quality check
  [ML-WARN-002] No prompt versioning -- changes to prompts are not tracked

Phase 3: DESIGN
  Recommended: Move prompts to YAML files with version tags
  Recommended: Implement promptfoo or custom eval harness with golden QA pairs
  Recommended: Add token budget middleware (max 4096 tokens per request)
  Recommended: Use LangChain PromptTemplate with input validation
  Generated: evals/eval_config.yaml (promptfoo configuration)
  Generated: src/middleware/token_budget.py (request token limiter)

Phase 4: VALIDATE
  Deployment readiness: NOT_READY (2 errors, 2 warnings)
  Critical: prompt injection risk and unbounded token usage must be fixed
```

### Example: Scikit-learn Classifier with W&B Tracking

```
Phase 1: DETECT
  Frameworks: scikit-learn 1.4, XGBoost 2.0
  Tracking: Weights and Biases (23 runs, 3 sweeps)
  Models: 1 XGBoost classifier (model.pkl in models/)
  Serving: Flask app with /predict endpoint

Phase 2: ANALYZE
  [ML-ERR-001] models/model.pkl committed to git (12MB)
    Should be in W&B Artifacts or external storage
  [ML-ERR-002] app.py:15
    pickle.load(open("models/model.pkl")) on every request
  [ML-WARN-001] training/train.py
    Only accuracy logged -- imbalanced dataset needs precision/recall
  [ML-INFO-001] W&B sweeps well-configured, good hyperparameter search

Phase 3: DESIGN
  Recommended: Store model in W&B Artifacts, download at startup
  Recommended: Load model once in Flask app factory, not per-request
  Recommended: Add classification_report metrics to training
  Generated: .gitignore addition for *.pkl
  Generated: app.py refactor with model singleton

Phase 4: VALIDATE
  Deployment readiness: NOT_READY (2 errors)
  Critical: model in git and per-request loading must be fixed
  After fixes: projected NEEDS_ATTENTION (missing precision/recall metrics)
```

## Gates

- **No deploying models without evaluation.** A model that has not been evaluated against a golden set or baseline cannot be promoted to production. This is always an error.
- **No per-request model loading.** Loading model weights on every inference request is a performance and reliability error. Models must be loaded at application startup.
- **No committing model files to git.** Binary model files (`.pkl`, `.pt`, `.h5`, `.onnx`) belong in artifact stores, not in version control. If detected, flag as error with migration path.
- **No hardcoded prompts with user input concatenation.** String concatenation for prompt construction is a prompt injection vulnerability. Must use parameterized templates.

## Escalation

- **When experiment tracking requires infrastructure changes:** If MLflow tracking server or W&B workspace needs to be provisioned, flag it: "Experiment tracking requires an MLflow server. This is an infrastructure task outside this skill's scope -- coordinate with the platform team."
- **When model performance is below threshold but no alternative exists:** Do not approve deployment of an underperforming model. Report: "Model accuracy is 72% against a 80% threshold. Options: (A) collect more training data, (B) try a different architecture, (C) revise the threshold with stakeholder approval."
- **When GPU/memory requirements exceed available infrastructure:** Flag the resource gap: "This model requires 16GB GPU memory for serving. Current infrastructure provides 8GB. Either quantize the model or provision larger instances."
- **When prompt evaluation reveals safety concerns:** If prompts can generate harmful, biased, or factually incorrect content in evaluation, escalate immediately: "Evaluation found the model generates fabricated citations in 12% of test cases. This must be addressed with output validation before deployment."
