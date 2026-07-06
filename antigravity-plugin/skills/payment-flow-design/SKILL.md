---
name: payment-flow-design
description: Designs robust, state-machine driven payment workflows.
---

# Payment Flow Design Skill

**Trigger Condition**: New payment use case required.

## Input
- Payment use case

## Execution Steps
1. Analyze the payment use case (UPI, Bank transfer, virtual accounts, refunds, etc.).
2. Map out all possible state transitions.
3. Define the retry model and exponential backoff parameters.
4. Detail failure handling and edge cases.
5. Architect the webhook consumption flow ensuring idempotency.

## Output
- State machine
- Retry model
- Failure handling
- Webhook architecture
