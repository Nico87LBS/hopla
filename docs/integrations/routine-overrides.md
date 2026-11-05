# Routine overrides for external integrations

Hopla exposes a narrowly scoped integration token for services such as Home Assistant. The token can only list active routine occurrences and apply skip/restore overrides; it cannot read the rest of the family's data or modify tasks.

## Create and revoke a token

A family parent creates a token through the normal authenticated Hopla API:

```http
POST /api/v1/games/routines/integrations
Authorization: Bearer <parent-session-jwt>
Content-Type: application/json

{"name":"Home Assistant"}
```

The response contains the integration record and a `token` secret. Store that secret in the integration's secret store: Hopla stores only its SHA-256 hash and will not show the secret again.

List tokens with `GET /api/v1/games/routines/integrations`. Revoke one with `DELETE /api/v1/games/routines/integrations/{tokenId}`.

## Discover active occurrences

Poll:

```http
GET /integration/v1/games/routines/occurrences
X-Hopla-Routine-Token: <routine-integration-token>
```

The response contains unexpired active occurrences, plus finished occurrences that still have pending optional items, in that token's family. Each occurrence includes its ID, member ID, routine name, start and expiry timestamps, and items. Items expose their task name, selected slot ID (if any), status, position, and whether they are currently available.

## Skip an item

Use the occurrence ID and item ID from the active-occurrences response:

```http
POST /integration/v1/games/routines/occurrences/{occurrenceId}/overrides
X-Hopla-Routine-Token: <routine-integration-token>
Content-Type: application/json

{
  "action": "skip",
  "itemId": 42,
  "reason": "Température extérieure élevée",
  "externalReference": "home-assistant/manteau",
  "idempotencyKey": "ha-event-2026-11-05-001",
  "expiresAt": "2026-11-05T18:00:00Z"
}
```

For a skip, `expiresAt` is required and must be in the future, no more than 48 hours away, and no later than the occurrence expiry. The idempotency key is scoped to the occurrence item; retries with the same key and payload are safe.

## Restore an externally skipped item

If the external condition changes before a dependent step has been completed, send:

```http
POST /integration/v1/games/routines/occurrences/{occurrenceId}/overrides
X-Hopla-Routine-Token: <routine-integration-token>
Content-Type: application/json

{
  "action": "restore",
  "itemId": 42,
  "reason": "La température a baissé",
  "externalReference": "home-assistant/manteau",
  "idempotencyKey": "ha-event-2026-11-05-002"
}
```

A restore only reverses the latest external skip. It cannot undo a manual skip, a completed item, an occurrence that has finished or expired, or an item whose dependent step has already been completed.

All overrides are audited with their source, reason, external reference, idempotency key, creation time and expiry/revocation time. All endpoints enforce family isolation.
