# ADR-004: Deterministic local typing engine

**Status:** Accepted · 2026-10-06

## Context
Typing must feel instant, be private and be predictable (spec §33, §44, §45). Trust depends on users being able to anticipate behaviour.

## Options
1. A model or LLM call per boundary.
2. A local deterministic pipeline: parsers, curated data, fixed confidence policy.

## Decision
Option 2. No network on the typing path. Confidence is a fixed function of rule data, parse features and mode: ≥ 0.95 autocorrect, 0.70–0.94 suggest, otherwise nothing. Local adaptation is limited to visible, resettable state: the never-convert list, and demotion after repeated restores within a session.

## Rationale
- Measured decisions take about 0.1 ms, against a 5 ms budget.
- Every decision is explainable; the playground debug panel prints the reasons.
- Exam or offline use works.

## Tradeoffs
Ambiguous identifiers such as `USB3` and `C3PO` need curated lexicons, because structure alone cannot separate them from `UF6`. New false positives are fixed with data plus tests, not learned.

## Evidence
The performance test in `engine.test.ts`, the negative corpus (100+ tokens, 16 sentences, both modes), and debug reasons in the E2E tests.
