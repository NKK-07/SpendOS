---
name: schema-design
description: Designs database schemas and migration files.
---

# Schema Design Skill

**Trigger Condition**: New entity or data model needed.

## Input
- Entity description
- Relationships with other entities
- Primary query patterns

## Execution Steps
1. Analyze the entity description and relationships.
2. Ensure standard columns are included: id (UUID), company_id (UUID, FK), created_at, updated_at, deleted_at (soft delete).
3. Draft the Prisma schema additions.
4. Generate forward-only migration SQL if applicable.
5. Recommend indexes based on primary query patterns.
6. Update ER diagrams.

## Output
Prisma schema additions, migration SQL, index recommendations, and ER diagram updates.
