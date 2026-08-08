This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Database (PostgreSQL + PostGIS)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Configuration

Copy the example file, then adjust the values if needed:

```bash
cp .env.example .env
```

### Start the database

```bash
docker compose up -d
```

### Stop the database

```bash
docker compose down       # stops the container, keeps the data
docker compose down -v    # stops the container AND deletes the data (volume)
```

### Connect to PostgreSQL

```bash
docker compose exec db psql -U xtrail -d xtrail
```

(replace `xtrail` with your `POSTGRES_USER` / `POSTGRES_DB` values if you changed them in `.env`)

### Architecture

- `docker-compose.yml` defines a `db` service based on the official `postgis/postgis:17-3.5` image (PostgreSQL 17 + PostGIS 3.5, extension enabled automatically on the database's first startup).
- Data is stored in a **named** Docker volume (`xtrail_postgres_data`), independent of the container's lifecycle: `docker compose down` (without `-v`) never deletes it, and nothing is written to the repo.
- Configuration (database name, user, password, port) lives in `.env` at the project root — never committed, see `.env.example` for the template. Both `docker-compose.yml` and Next.js read this same file.
- `DATABASE_URL` is already in the format expected by [Prisma](https://www.prisma.io/), which reads that same `.env`.

### Prisma

The schema (`prisma/schema.prisma`) and migrations (`prisma/migrations/`) are versioned in the repo.

```bash
npx prisma migrate dev    # applies migrations to your local database (creates them if needed)
npx prisma studio         # web UI for browsing the data
npx prisma generate       # regenerates the Prisma client (done automatically by migrate dev)
```

Models: `Player`, `ExternalConnection`, `Activity`, `ActivityHexagon`, `Territory`, `ActivitySyncJob` — see the comments in `schema.prisma` for what each table is for.

### Checking the database directly

```bash
docker exec -it xtrail-db psql -U xtrail -d xtrail
SELECT current_database();
SELECT PostGIS_Version();
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
