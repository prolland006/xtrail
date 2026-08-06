# xTrail - Claude Code Project Instructions

## Project Overview

xTrail is a trail running territory conquest application.

Users connect their Strava account and their activities are imported automatically.
GPS tracks are converted into H3 hexagons.
Each hexagon represents a territory.
The player with the highest accumulated presence in a hexagon becomes its owner.

The map must display persisted territories and must never recalculate all territories on each request.

---

# Tech Stack

- Next.js
- TypeScript
- React
- PostgreSQL
- PostGIS
- Prisma ORM
- Docker
- H3 geospatial indexing

---

# General Development Rules

- Use TypeScript strict mode.
- Prefer simple, maintainable, production-quality solutions.
- Do not add dependencies unless there is a clear benefit.
- Explain architectural decisions before implementing major changes.
- Keep the codebase clean and modular.
- Follow existing project conventions before introducing new patterns.

---

# Database Rules

- PostgreSQL is the source of truth.
- Database schema changes must always be done through Prisma migrations.
- Never manually modify the database schema in production.
- Never delete existing Prisma migrations.
- Never reset the database without explicit confirmation.
- Never store binary images directly in PostgreSQL. Store image URLs instead.
- Do not store secrets in the database schema or source code.

---

# xTrail Business Rules

## Players

A player has:

- first name
- last name
- email
- profile picture URL
- optional Strava account information

A player account must be unique.

---

## Activities

An activity:

- belongs to one player
- comes from an external platform such as Strava
- must not be imported twice
- contains GPS information
- contains distance, duration and elevation data

Activities are historical data and should be considered immutable.

---

## Territories

Territories are based on H3 hexagons.

Rules:

- Each territory corresponds to one H3 index.
- Territories are updated when new activities are imported.
- Do not recalculate all territories when displaying the map.
- Only affected hexagons should be updated after a new activity.
- The owner of a territory is the player with the highest accumulated presence in that hexagon.

---

# Activity Processing Rules

When importing a new activity:

1. Retrieve the GPS track.
2. Convert the track into H3 hexagons.
3. Store the relationship between the activity and visited hexagons.
4. Update only impacted territories.
5. Refresh the map data.

Keep enough historical data to allow future changes to the territory ownership algorithm.

---

# Docker Rules

- Docker configuration must remain versioned in Git.
- Never commit database volumes.
- Never commit real passwords or secrets.
- Use `.env.example` for required environment variables.
- Use `.env` only for local secrets.

---

# Git Rules

- Never commit secrets.
- Never execute destructive Git commands automatically.
- Never force push.
- Before major changes, explain:
  - what files will be modified
  - why the changes are needed
  - possible risks

Create commits only when explicitly requested.

---

# Safety Rules

Ask for confirmation before:

- deleting files
- dropping database tables
- resetting the database
- changing authentication logic
- modifying production configuration

Do not ask for confirmation for normal development operations such as:

- creating files
- editing source code
- installing standard dependencies
- running tests

---

# Code Quality Rules

Before finishing a task:

- verify TypeScript compilation
- check for obvious errors
- explain what was changed
- mention any remaining issues or future improvements

When modifying existing code:

- understand the current implementation first
- avoid unnecessary rewrites
- preserve existing functionality

---

# Communication Style

Be concise but explain important technical decisions.

When proposing a solution:

1. Explain the approach.
2. Explain the trade-offs.
3. Implement only after the approach is understood.

The goal is to build a maintainable application, not just make the current task work.

# Communication Rules

## Language

The project documentation, source code, comments, commit messages, identifiers and technical documentation should remain in English unless explicitly requested otherwise.

However, when communicating with me:

- Always answer in French.
- Explain technical concepts in French.
- Explain architectural decisions in French.
- Keep code, APIs, database schemas, identifiers and file names in English.
- Keep comments in source code in English unless I explicitly request French comments.

If I write prompts in English, treat them as implementation instructions only and continue responding to me in French.

## Map Architecture Rules

The map components are only responsible for visualization.

React components must:

- receive territory data
- display hexagons
- handle user interactions (zoom, selection, filtering)

React components must never:

- calculate H3 indexes
- process GPS tracks
- compute territory ownership
- query Strava directly
- contain territory business logic

All geospatial processing and territory calculations must happen on the server side through dedicated services.

The data flow must remain:

Strava API
|
v
Server processing services
|
v
PostgreSQL / Prisma
|
v
Territory API
|
v
Map components
