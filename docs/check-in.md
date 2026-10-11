# QR tickets and staff check-in

## Local installation and walkthrough

Copy src/, scripts/, tests/, package.json and package-lock.json from the updated package; retain .env and prisma.config.ts. Run npm ci, then restart npm run dev. This update does not change the database schema or add a migration.

Set ADMISSION_MODE=test in .env for the local Paystack TEST walkthrough; restart the app. Default live mode rejects test tickets. Keep the test/live databases separate; test check-in is marked as practice and never represents event entry.

1. Open /tickets/orders with your buyer account. Paid active tickets now show QR codes and their existing private codes; previously issued encrypted codes are retained. Print/save to PDF includes the QR.
2. Sign in with your existing enabled ADMIN organizer account, then open /staff/check-in. ADMIN and SCANNER accounts may check tickets; ordinary buyers and disabled staff cannot.
3. Choose Start camera and allow access. Scanning stops after one valid code is read; camera frames are decoded locally and are not uploaded. Only the opaque ticket token is sent to the server. Manual code entry works when camera access is unavailable.
4. Check ticket first, then explicitly Confirm test check-in. The first successful response shows confirmation; checking the same ticket again shows Already checked in and the original check-in time.

Camera access on phones requires HTTPS. Laptop localhost supports a local walkthrough. A phone opening a plain HTTP LAN address will generally need HTTPS or manual code entry. The camera uses the rear-facing preference and stops on explicit stop, successful scan, page hiding, or leaving the page. No offline admission exists; a failed/uncertain network request must be rechecked before staff permit entry.

## Separate scanner accounts

The organizer account can scan already. For a separate staff account, have that person sign in with Google, then open /api/auth/session in their own browser. It returns their verified email and hashed identity subject (an account identifier, not a session token). As the trusted database operator, verify those two values and run:

```sh
node --env-file=.env --import tsx scripts/grant-scanner.ts "SCANNER_EMAIL" "SCANNER_SUBJECT"
```

The command grants SCANNER only and refuses to demote an existing ADMIN. Scanner role cannot access organizer settings or roster review. Disable/revoke staff with trusted database tooling by setting StaffUser.enabled=false; every request checks current permission, including under a transaction lock. No browser role-grant endpoint is exposed.

## Admission safeguards

GET /api/admission/session requires current staff access. POST /api/admission/check and /api/admission/admit require an authenticated enabled ADMIN/SCANNER, exact-origin checks, strict token-only input, no-store responses, and a separate persistent quota of 240 requests per staff account per minute.

The server hashes the 256-bit private code, scopes lookup to the configured concert, locks current staff, order and ticket, and checks active ticket, PAID order without reconciliation flags, and a verified payment in the configured admission mode. Check-only does not create an admission. Confirmation inserts Admission and an actor-linked audit atomically. Order locks precede ticket locks; Admission.ticketId remains a unique primary key. Concurrent duplicate confirmations produce one successful admission and one already-used result.

Invalid, void, unpaid, wrong-mode, payment-review and used tickets are denied. Denial audits contain reason/mode and ticket ID when known, never raw tokens or QR payloads. No uncheck, delete, undo or offline override is supplied. Manual exception handling remains organizer work.

## Validation

QR generation is visually inspected and a round-trip test decodes the generated matrix with the independent camera decoder. Automated tests cover staff/disabled account rejection, preview without admission, wrong mode, void tickets, concurrent admission, retry timestamps, scanner/organizer privilege separation, auth/origin/strict input, and no raw codes in denial audits. Embedded PostgreSQL tests are not a substitute for native PostgreSQL concurrency CI. Camera permission, phone hardware, browser/device and printed-ticket tests still require local acceptance.

Implementation references:
- https://github.com/soldair/node-qrcode
- https://github.com/cozmo/jsQR
