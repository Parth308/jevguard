# JevGuard LinkedIn Post — F7 Money Ledger (v2)

**One post covers everything** (bench + cons + fine-tune). No post 2 required.

---

## COPY-PASTE (post body)

Spent $0.050 to prove regex is useless.

That's the cost of a 100-case prompt-injection benchmark across 4 architectures.

The ledger:

→ Regex: F1 0.383. Misses 76% of attacks.
→ LLM judge (qwen3.8-27b on Groq): F1 0.914. 166ms median. Tax on every call.
→ Laya (open-source, local RTX 3050): F1 0.831. 90ms. Free and private — 29% false positives on clean prompts.
→ JevGuard: F1 0.952. 493ms median. $0.05/1k calls.

Same 100 labeled cases. Same 7 attack categories. Same harness.

Honest cons, not a scorecard:

JevGuard leans on TypeSafe's System One gateway. This run showed a ~3s mean tail. Accuracy was 81%, not 100%.

Laya wins on cost and privacy. It still misses roleplay jailbreaks (38%) and over-blocks benign traffic.

Regex wins on speed. It loses on almost everything else.

I also fine-tuned Laya on 400 of my train cases (2×T4, ~6 minutes). Benign false positives: 29% → 0%. Recall dropped 0.78 → 0.55. Open weights give you control. Tiny data gives you spikes in both directions.

I built JevGuard as middleware with pluggable engines: typed questions in, confidence scores out, Zod schema checks + semantic checks, pre-generation prompt firewall, deterministic thresholds.

Full breakdown in the repo. Link in first comment.

What would you actually ship behind your guardrail — free local, cheap judge, or typed System 1?

P.S. System One launched Sep 15. This is the first independent benchmark on it.

---

## COPY-PASTE (first comment — pin immediately)

github.com/Parth308/jevguard

#AI #PromptInjection #LLMSecurity

---

## Attach

`benchmarks/jevguard-benchmark-linkedin.png` (1200×675, Laya 0.831 — matches body)

---

## Checklist

- [x] Single post = all cases (not exaggerated — just complete)
- [x] Laya 0.831 / 90ms (was wrong 0.600 / 309ms)
- [x] FT = tradeoff paragraph only, no 5th bar on image
- [x] Closing question
- [x] No link in body
- [x] Voice profile filled 2026-09-23 from 4 pasted posts (source: pasted)
- [ ] Post 6:30pm Wed — inside Buffer 3–8pm peak (Wed = best day)

---

## Notes

- **Fine-tune:** ship gate failed (jailbreak 38%, harm 31%, F1 0.712). Claim FPR 29→0 + recall cost. Never claim win.
- **Image:** keep baseline only.
- **Voice profile:** one-time style sheet for `linkedin-humanizer`. Unfilled = fine for this post.
- **Post 2:** only if you want more content later. Not needed.
