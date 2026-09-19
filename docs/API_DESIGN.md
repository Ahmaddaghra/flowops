# API Design Plan

The exact contract will evolve through implementation, but these resource boundaries define the MVP.

## Authentication
- `POST /api/auth/register` (development/demo scope; may be restricted later)
- `POST /api/auth/login`
- `GET /api/auth/me`

## Work items
- `GET /api/work-items`
- `POST /api/work-items`
- `GET /api/work-items/{id}`
- `PATCH /api/work-items/{id}`
- `POST /api/work-items/{id}/status`
- `POST /api/work-items/{id}/assign`

Query capabilities for listing:
- `search`
- `status`
- `priority`
- `categoryId`
- `assigneeId`
- `page`
- `pageSize`
- `sort`

## Comments
- `GET /api/work-items/{id}/comments`
- `POST /api/work-items/{id}/comments`

## Activity
- `GET /api/work-items/{id}/activity`

## Categories
- `GET /api/categories`

## Dashboard
- `GET /api/dashboard/summary`

## Error model

Use RFC 7807-style Problem Details responses where practical. Validation errors should be structured so the React client can map field-level messages without parsing strings.

## Pagination response

Prefer explicit metadata, for example:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalItems": 0,
  "totalPages": 0
}
```
