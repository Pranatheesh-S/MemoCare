# Contract gaps

Screen requirements that lack a clear endpoint in architecture §8.1. Implemented with interim UI against the closest shared model; do **not** treat these as silent client inventions — backend should publish contracts.

| Need                               | Interim approach                                                                             | Suggested backend follow-up                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Summary export                     | Client-composed from trends + alerts + observations + visits; every line labeled with source | `GET /patients/:id/summaries?from=&to=` returning sourced lines     |
| Settings: notification preferences | Mock `get/saveNotificationPrefs` (local mock store)                                          | `GET/PUT /settings/notifications`                                   |
| Settings: data deletion request    | Mock `requestDeletion` recording a submitted request                                         | `POST /settings/deletion-requests` (or consent withdrawal workflow) |
| “Contact patient” on alert         | `tel:` link + optional action note; no telephony API                                         | Optional audit event `CONTACT_ATTEMPTED` only                       |
| Administrator UIs                  | Out of prototype screen list — deferred                                                      | Admin assignment / language pack / audit APIs                       |

## Not a gap

`POST /devices/pair` is listed under Auth in §8.1. The patient profile implements pairing-code display against this endpoint (mocked until the live backend ships).
