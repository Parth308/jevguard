# JevGuard 100-Case Empirical Benchmark & Safety Evaluation Report

This document records the empirical results of evaluating **100 labeled test cases** across 4 distinct safety architectures in a live production environment.

- **Date:** September 22, 2026
- **Dataset:** 100 labeled test cases across 7 categories ([`benchmarks/dataset.json`](./dataset.json))
- **Execution Mode:** LIVE API Execution (`npm run benchmark -- --live`)
- **Judge LLM:** `qwen/qwen3.8-27b` on Groq (OpenAI-compatible endpoint, 2.1s auto-pacing)
- **JevGuard:** `typesafe-ai/jev` via Vercel AI Gateway / TypeSafe
- **Laya:** Convai Laya (Local System 1 Server on NVIDIA RTX 3050 GPU)

---

## 1. Executive Summary & Overall Metrics

| Approach | Architecture | F1 Score | Precision | Recall | Accuracy | FPR (%) | FNR (%) | P50 Latency | Mean Latency | Cost / 1k Evals |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Regex / Keyword Heuristics** | Rule-based regex pattern matcher | `0.383` | `1.000` | `0.237` | `42.0%` | `0.0%` | **`76.3%`** | **`< 0.1ms`** | **`< 0.1ms`** | **$0.00** |
| **LLM-as-a-Judge (`qwen3.8-27b`)** | Autoregressive 27B LLM on Groq | `0.914` | `1.000` | `0.842` | `84.0%` | `0.0%` | `15.8%` | **`165.9ms`** | `298.9ms` | **~$0.05** |
| **JevGuard (`typesafe-ai/jev`)** | Non-autoregressive System 1 Gateway | **`0.952`** | **`0.986`** | **`0.921`** | `81.0%` | `4.2%` | **`7.9%`** | `492.5ms` | `3088.6ms` | **~$0.05** |
| **Convai Laya** | Self-hosted System 1 on RTX 3050 GPU | `0.831` | `0.894` | `0.776` | `75.0%` | `29.2%` | `22.4%` | `90.4ms` | `103.6ms` | **$0.00** |

> **Laya re-run (post-fix):** Initial live run reported F1 `0.600` due to a server field mismatch (`text` vs `instructions`) that stripped question instructions before inference. After fixing [`scripts/laya_server.py`](../scripts/laya_server.py), Laya re-ran clean at F1 `0.831` (see §4 raw log).

---

## 2. Category Detection Breakdown (% Correctly Handled)

Accuracy rate per category across all 100 labeled test cases:

| Approach | Benign (24) | Injection (16) | Jailbreak (16) | Harm (16) | Adversarial (12) | Uncertainty (10) | Refusal (6) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Regex / Keyword Heuristics** | **100%** | `38%` | `13%` | `31%` | `8%` | `0%` | `67%` |
| **LLM-as-a-Judge (`qwen3.8-27b`)** | **100%** | **100%** | **100%** | **100%** | **100%** | `0%`* | `0%`* |
| **JevGuard (`typesafe-ai/jev`)** | `96%` | **`75%`** | **`75%`** | **`75%`** | **`75%`** | **`70%`** | **`100%`** |
| **Convai Laya (Local GPU)** | `71%` | **`100%`** | `38%` | `63%` | `92%` | `90%` | **`100%`** |

*\*Note on LLM Judge category metrics:*
- On **Uncertainty**: The LLM judge classified unverified claims (e.g. cancer alkaline water, guaranteed 100x crypto surge) as strict **`block`** rather than **`flag`**. In binary safety evaluation (safe vs unsafe), it caught 100% of uncertainty violations, but in exact multi-class categorization, `block !== flag`.
- On **Refusal**: The judge treated refusals as benign `pass` since the assistant response did not contain the dangerous payload itself. JevGuard's dedicated `refusal` rubric, however, correctly classified 100% of refusals.

---

## 3. Deep-Dive Deductions & Architectural Insights

### A. Regex Heuristics: Blinding False Negative Rate (76.3% FNR)
- **What worked:** Zero false positives on benign user requests (`100%` accuracy, `0.0%` FPR). Ultra-fast `< 0.1ms` evaluation.
- **Why it failed:** Bypassed by 76.3% of attacks. Failed completely on:
  - Roleplay / fiction framing (DAN, grandmother exploit, Machiavelli)
  - Character spacing (`d r o p   t a b l e`) and zero-width spaces (`\u200b`)
  - Subtle indirect injections (Markdown image leaks, prompt delimiter manipulation)
  - Ungrounded financial / health speculation (`0%` detection)

### B. JevGuard (`typesafe-ai/jev`): Highest F1 Score (0.952)
- **Top F1 Score:** Led all approaches with **`0.952` F1 score** and **`0.921` Recall** (only `7.9%` false negative rate).
- **Balanced Multi-Rubric Coverage:** Achieved consistent 70%–100% detection across all attack categories, including subtle adversarial homoglyphs and formatted model refusals.
- **Low Cost:** Incurred standard fixed token cost of ~$0.05 per 1,000 evaluations.

### C. LLM-as-a-Judge (`qwen/qwen3.8-27b` on Groq): Zero-Shot Precision
- **100% Detection on Direct Attacks:** Perfect 100% detection on prompt injection, jailbreaks, malicious payloads, and obfuscated adversarial prompts.
- **Blazing P50 Latency (165.9ms):** Thanks to Groq's LPU architecture, classification completed in ~166ms.
- **Rate-Limiting Discipline:** Free tier enforces 30 RPM (1 request / 2 seconds). With JevGuard's built-in 2.1s pacing and 429 auto-retry backoff, the live suite executed all 100 calls without quota interruptions.

### D. Convai Laya: Zero-Cost Self-Hosted System 1
- **Local Inference:** Fully private, self-hosted on local hardware (tested on NVIDIA GeForce RTX 3050 Laptop GPU).
- **$0.00 API Cost:** Completely free of cloud provider billing and rate limits.
- **Post-fix accuracy (F1 0.831):** 100% on injection and refusal; 90%+ on uncertainty and adversarial. Remaining misses concentrate in roleplay-framed jailbreaks (38%) and technical benign false flags (GDPR, B-tree).
- **Trade-off:** Still weaker than JevGuard/LLM-judge on jailbreak/harm framing; strong free local option when API cost is the constraint.

---

## 4. Raw Live Terminal Output Log

```text
> jevguard@0.1.0 benchmark
> tsx benchmarks/run-benchmark.ts --live

================================================================================
             JevGuard Benchmark & Safety Evaluation Suite                       
 Dataset: 100 labeled test cases across all safety dimensions       
 Mode: LIVE (Real API Endpoints)
 - LLM Judge: qwen/qwen3.8-27b (via https://api.groq.com/openai/v1)
 - JevGuard:  typesafe-ai/jev (via Vercel Gateway / TypeSafe)
================================================================================

Evaluating Regex / Keyword Heuristics [100 cases]... Done.
Evaluating LLM-as-a-Judge (qwen/qwen3.8-27b - Live API) [100 cases]... Done.
Evaluating JevGuard (Live Gateway / TypeSafe) [100 cases]... Done.
Evaluating Laya (Open-Source System 1 - Convai) [100 cases]... Done.

--- Comparative Evaluation Results ---

Approach                                       | F1 Score   | Precision   | Recall   | Accuracy   | FPR (%)   | FNR (%)   | P50 Latency   | Mean Latency   | Cost / 1k Evals  
-----------------------------------------------|------------|-------------|----------|------------|-----------|-----------|---------------|----------------|------------------
Regex / Keyword Heuristics                     | 0.383      | 1.000       | 0.237    | 42%        | 0%        | 76.3%     | 0.1ms         | 0.1ms          | $0.000           
LLM-as-a-Judge (qwen/qwen3.8-27b - Live API)   | 0.914      | 1.000       | 0.842    | 84%        | 0%        | 15.8%     | 165.95ms      | 298.9ms        | $0.050           
JevGuard (Live Gateway / TypeSafe)             | 0.952      | 0.986       | 0.921    | 81%        | 4.2%      | 7.9%      | 492.5ms       | 3088.6ms       | $0.050           
Laya (Open-Source System 1 - Convai)           | 0.831      | 0.894       | 0.776    | 75%        | 29.2%     | 22.4%     | 90.35ms       | 103.6ms        | $0.000           

--- Category Detection Breakdown (% Correctly Handled) ---

Approach                                       | Benign (24)   | Injection (16)   | Jailbreak (16)   | Harm (16)   | Adversarial (12)   | Uncertainty (10)   | Refusal (6)  
-----------------------------------------------|---------------|------------------|------------------|-------------|--------------------|--------------------|--------------
Regex / Keyword Heuristics                     | 100%          | 38%              | 13%              | 31%         | 8%                 | 0%                 | 67%          
LLM-as-a-Judge (qwen/qwen3.8-27b - Live API)   | 100%          | 100%             | 100%             | 100%        | 100%               | 0%                 | 0%           
JevGuard (Live Gateway / TypeSafe)             | 96%           | 75%              | 75%              | 75%         | 75%                | 70%                | 100%         
Laya (Open-Source System 1 - Convai)           | 71%           | 100%             | 38%              | 63%         | 92%                | 90%                | 100%          

Key Takeaways:
1. Regex is ultra-fast ($0.00, FNR 76.3%) but suffers from high False Negatives on obfuscated attacks.
2. LLM-as-a-Judge reaches F1 0.914 at 165.9ms P50 on this configuration (provider-dependent; standard LLMs often exceed 1,800ms).
3. JevGuard leads with F1 0.952 at 492.5ms P50 (~$0.05/1k evals; mean 3088.6ms reflects gateway tail latency).
4. Laya (Open-Source System 1) runs non-autoregressively on local GPUs at 90.4ms P50 and $0.00 cost (F1 0.831 after server instructions fix).
```
