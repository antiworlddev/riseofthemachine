# Approved expansion scope — 12 October 2026

These items are approved for subsequent implementation, not optional scope decisions. Shipping payment implementation is now included. Table booking management and VIP parking are included. Additional KALA sports and representative transfers are included; eligibility declarations/review are included; initial tournament operations are included.

## KALA GAMES

- Implemented: add enabled sports/rosters to an existing team without unlocking approved/submitted rosters.
- Implemented: organizer-controlled whole-team transfers to an existing verified representative profile, with preview/confirmation, audit history and ownership locks.
- Implemented: organizer-configurable per-sport requirements, declaration/evidence statements, immutable submission snapshots/history and explicit combined eligibility/roster review. No age, enrolment, university-domain or evidence criterion is assumed. Private document uploads and retroactive re-review are separate work.
- Implemented: random single round-robin/knockout draws from approved rosters, fixture scheduling, scores, bracket advancement/byes, configured league standings/tiebreakers, tournament publication and audited corrections. Additional formats and notification/push features remain subsequent work.
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
4. Additional KALA sports/representative transfers — implemented. Eligibility declarations/review — implemented. Initial fixtures/draws/results/standings — implemented; configure actual formats/rules, timetable and hosted acceptance.
5. Notifications/support tools, catalogue/search/export improvements and remaining production hardening.

Business values still needed before those flows open: delivery rates/zones, table parking allocations/capacity, and KALA eligibility/scoring/tiebreak rules. Configure these explicitly rather than seed invented rules.

Approved roster rejection and tournament review holds implemented; see approved-roster-rejection.md.

Staff access management and filtered safe audit history implemented; see staff-access-audit.md.

Merch catalogue editing, images/variants and filtered operational order exports implemented; see merch-catalog-orders.md.

Transactional table, merch and KALA notifications plus organizer email operations implemented; see notifications.md.
