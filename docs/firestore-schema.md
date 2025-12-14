# Firestore Schema (Proposed)

This describes the collections/fields that replace the former Sheets/Apps Script outputs. Adjust as needed.

## Collections

### `students/{id}`
- `name`: string
- `email`: string
- `status`: string (`Active`/`Inactive`)
- `className`: string
- `timezone`: string (IANA; default to org timezone)
- `hourlyRate`: number (optional per-student override)
- `balance`: number (optional cached balance)
- `createdAt`: timestamp (server)
- `updatedAt`: timestamp (server)

### `events/{id}`
- `studentId`: string (ref to students)
- `timestamp`: timestamp (event time)
- `action`: string (`CLOCK_IN` | `BREAK_START` | `BREAK_END` | `CLOCK_OUT`)
- `source`: string (`form` | `manual`)
- `createdAt`: timestamp (server)

Index: `events` orderBy `timestamp`, filter by `timestamp >=`.

### `sessions/{id}` (derived)
- `studentId`: string
- `dateStr`: string (`YYYY-MM-DD`)
- `clockIn`: timestamp
- `clockOut`: timestamp
- `grossMs`: number
- `breakMs`: number
- `netMs`: number
- `breakCount`: number
- `createdAt`: timestamp (server)

Suggested index: `sessions` where `studentId ==` and `dateStr` range.

### `warnings/{id}` (derived)
- `studentId`: string
- `dateStr`: string (`YYYY-MM-DD`)
- `issue`: string
- `details`: string (optional)
- `startTs`: timestamp (optional)
- `endTs`: timestamp (optional)
- `createdAt`: timestamp (server)

### `status/{id}` or `status/{date}/entries/{studentId}` (choose one)
- `studentId`: string
- `dateStr`: string
- `firstIn`: timestamp/null
- `lastBreakStart`: timestamp/null
- `lastBreakEnd`: timestamp/null
- `lastOut`: timestamp/null
- `status`: string (`Present`/`On Break`/`Left`/`Missing`)
- `computedAt`: timestamp (server)

### `rewards/{id}`
- `name`: string
- `price`: number
- `description`: string
- `active`: boolean
- `createdAt`: timestamp (server)

### `purchases/{id}`
- `studentId`: string
- `itemId`: string (ref to rewards)
- `itemName`: string (denormalized)
- `cost`: number
- `date`: timestamp
- `createdAt`: timestamp (server)

### `pay_periods/{id}`
- `startDate`: timestamp/date-only
- `endDate`: timestamp/date-only
- `display`: string (e.g., `Jan 1 - Jan 14, 2026`)
- `hourlyRate`: number
- `createdAt`: timestamp (server)

### `payroll/{id}` (per student per period)
- `studentId`: string
- `periodId`: string (ref to pay_periods)
- `periodEnd`: timestamp/date-only (denormalized)
- `netHours`: number (after unpaid breaks)
- `paidBreakMins`: number
- `paidHours`: number (`netHours + paidBreakMins/60`)
- `warningsCount`: number
- `fines`: number
- `purchases`: number (total)
- `grossPay`: number
- `deductions`: number
- `netPay`: number
- `deposited`: boolean
- `createdAt`: timestamp (server)

### `bank/{id}` (or embed on students)
- `studentId`: string
- `lifetimeEarnings`: number
- `fines`: number
- `spent`: number
- `balance`: number
- `updatedAt`: timestamp (server)

## Security (high-level)
- Students: read their own docs in `students`, `sessions`, `warnings`, `status`, `payroll`, `bank`, `purchases` (where `studentId == auth.uid` or mapped). Write `purchases` optionally.
- Staff: role/claim `staff` can read/write all, run payroll, rebuild.
- Lock down `events` writes to the ingest function; optionally allow staff to add manual events.

## Indexes to add early
- `events`: composite on `timestamp` (orderBy) and optionally `studentId` + `timestamp`.
- `sessions`: `studentId` + `dateStr` (orderBy).
- `warnings`: `studentId` + `dateStr` (orderBy).
- `purchases`: `studentId` + `date` (orderBy).
- `payroll`: `studentId` + `periodId`.
