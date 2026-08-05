-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strava_accounts" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "strava_athlete_id" BIGINT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" SERIAL NOT NULL,
    "strava_id" BIGINT NOT NULL,
    "player_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "distance_meters" DOUBLE PRECISION NOT NULL,
    "moving_time_seconds" INTEGER NOT NULL,
    "elevation_gain_meters" DOUBLE PRECISION NOT NULL,
    "polyline" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_hexagons" (
    "activity_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "h3_index" VARCHAR(20) NOT NULL,
    "distance_meters" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "activity_hexagons_pkey" PRIMARY KEY ("activity_id","h3_index")
);

-- CreateTable
CREATE TABLE "territories" (
    "h3_index" VARCHAR(20) NOT NULL,
    "owner_id" INTEGER,
    "owner_presence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("h3_index")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_email_key" ON "players"("email");

-- CreateIndex
CREATE UNIQUE INDEX "strava_accounts_player_id_key" ON "strava_accounts"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "strava_accounts_strava_athlete_id_key" ON "strava_accounts"("strava_athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_strava_id_key" ON "activities"("strava_id");

-- CreateIndex
CREATE INDEX "activities_player_id_start_date_idx" ON "activities"("player_id", "start_date");

-- CreateIndex
CREATE INDEX "activity_hexagons_h3_index_player_id_idx" ON "activity_hexagons"("h3_index", "player_id");

-- CreateIndex
CREATE INDEX "territories_owner_id_idx" ON "territories"("owner_id");

-- AddForeignKey
ALTER TABLE "strava_accounts" ADD CONSTRAINT "strava_accounts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_hexagons" ADD CONSTRAINT "activity_hexagons_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_hexagons" ADD CONSTRAINT "activity_hexagons_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
