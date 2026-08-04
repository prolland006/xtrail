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

## Base de données (PostgreSQL + PostGIS)

### Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et démarré

### Configuration

Copier le fichier d'exemple, puis ajuster les valeurs si besoin :

```bash
cp .env.example .env
```

### Démarrer la base

```bash
docker compose up -d
```

### Arrêter la base

```bash
docker compose down       # arrête le conteneur, conserve les données
docker compose down -v    # arrête le conteneur ET supprime les données (volume)
```

### Se connecter à PostgreSQL

```bash
docker compose exec db psql -U xtrail -d xtrail
```

(remplacer `xtrail` par tes valeurs de `POSTGRES_USER` / `POSTGRES_DB` si tu les as changées dans `.env`)

### Architecture

- `docker-compose.yml` définit un service `db` basé sur l'image officielle `postgis/postgis:17-3.5` (PostgreSQL 17 + PostGIS 3.5, extension activée automatiquement au premier démarrage de la base).
- Les données sont stockées dans un volume Docker **nommé** (`xtrail_postgres_data`), indépendant du cycle de vie du conteneur : `docker compose down` (sans `-v`) ne les supprime jamais, et rien n'est écrit dans le dépôt.
- La configuration (nom de base, utilisateur, mot de passe, port) vit dans `.env` à la racine du projet — jamais commité, voir `.env.example` pour le modèle. `docker-compose.yml` et Next.js lisent tous les deux ce même fichier.
- `DATABASE_URL` y est déjà au format attendu par [Prisma](https://www.prisma.io/) ; l'initialisation de Prisma (`npx prisma init`, schéma, migrations) reste une étape à venir — aucune table métier n'existe encore, seule l'infrastructure PostgreSQL/PostGIS est en place.

## Check docker DB

docker exec -it xtrail-db psql -U xtrail -d xtrail
SELECT current_database();
SELECT PostGIS_Version();

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
