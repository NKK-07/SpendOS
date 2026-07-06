---
name: api-design
description: Designs RESTful API contracts and OpenAPI specifications.
---

# API Design Skill

**Trigger Condition**: New endpoint or resource needed.

## Input
- Resource name
- List of required operations (CRUD)
- Auth level requirements
- Rate limit requirements

## Execution Steps
1. Parse input: resource name, operations, auth, rate limit.
2. Design RESTful route structure following SpendOS conventions (plural nouns, kebab-case).
3. Define request schemas (required/optional fields, types, validation rules).
4. Define response schemas (success body, pagination metadata).
5. Define error responses mapping to RFC 7807 Problem Detail format.
6. Generate OpenAPI 3.1 YAML block.
7. Generate Zod validation schemas for TypeScript backend.
8. Generate example curl commands for each operation.
9. Validate against existing API patterns for consistency.

## Output
- OpenAPI YAML spec block
- TypeScript Zod validation schemas
- Example `curl` commands
