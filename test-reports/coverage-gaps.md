# REST Coverage Gaps

- Routes in app: 125
- Exercised by run-rest.js + run-rest-gaps.js: 125 (100.0%)
- UNTESTED: 0

| by method | total | covered | untested |
|---|---|---|---|
| DELETE | 14 | 14 | 0 |
| GET | 67 | 67 | 0 |
| POST | 19 | 19 | 0 |
| PUT | 25 | 25 | 0 |

## Untested routes

_none — every mounted route is exercised_

## Requests that fell through to an error (no route handled them)

_Requests that matched no route and did not return a success. These are the
only unmatched hits that indicate a real coverage gap._

_none_

## Requests served by middleware with no route

_These matched no `req.route` but still returned a success, so they are not
gaps (e.g. the Swagger UI is mounted as middleware rather than as a route)._

- `GET /api-docs/ -> 200`
