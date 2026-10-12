# Approved expansion scope — 12 October 2026

These items are approved for subsequent implementation, not optional scope decisions. Shipping payment implementation is now included. Table booking management and VIP parking are included. KALA expansion remains subsequent work.

## KALA GAMES

- Add additional sports/rosters to an existing team registration without unlocking previously approved rosters.
- Organizer-controlled representative transfers to a verified account, with an audit history and ownership checks.
- Organizer-configurable eligibility requirements and review. Do not assume age, enrolment criteria, university email domains or evidence requirements until supplied.
- Fixtures, draws, results and standings, with sport-specific scoring/tiebreak rules, publication controls and audited corrections.
- Registration remains free and representative-managed.

## Tables and VIP parking

- Implemented: Engines ₦3m, Autobots ₦5m, Machineries ₦10m; one table per Paystack checkout and organizer booking management.
- Implemented: private VIP parking codes issued after verified payment, with separate one-time parking entry.
- Configure parking allocation per package/booking and overall capacity; do not invent the number of vehicles/passes.
- Payment/booking confirmation must precede entitlements. Parking admission should have its own one-time check-in and should not consume a concert ticket admission.
- Cancellation/refunds must revoke unused booking/parking entitlements consistently.

## Automated shipping payments

- Implemented: server-priced delivery charges collected with merchandise through Paystack for new orders; legacy orders retain their original terms.
- Initial implementation can use organizer-managed Nigerian delivery zones/rates; no carrier or courier API has been selected.
- Display the delivery fee and complete checkout total before payment, snapshot the selected rate and address, and validate the quoted fee on the server.
- Event pickup remains free of a delivery charge.
- No delivery prices or covered locations are assumed. Delivery checkout must be configured with real rates before opening.

## Implementation sequence

1. Complete payment support/full refunds and hosted acceptance (current update).
2. Automated shipping fee collection and rate administration — implemented; real rates and hosted acceptance remain.
3. Table booking management and VIP parking — implemented; configure real capacities/allocations and complete hosted acceptance.
4. Additional KALA administration, eligibility and tournament operations.
5. Notifications/support tools, catalogue/search/export improvements and remaining production hardening.

Business values still needed before those flows open: delivery rates/zones, table parking allocations/capacity, and KALA eligibility/scoring/tiebreak rules. Configure these explicitly rather than seed invented rules.
