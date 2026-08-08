import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STRAVA_PROVIDER } from "@/lib/strava";

type StravaAspectType = "create" | "update" | "delete";

type StravaWebhookEvent = {
  object_type: string;
  object_id: number;
  aspect_type: StravaAspectType;
  owner_id: number;
  event_time: number;
};

function parseWebhookEvent(body: unknown): StravaWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.object_type !== "string") return null;
  if (typeof b.object_id !== "number") return null;
  if (b.aspect_type !== "create" && b.aspect_type !== "update" && b.aspect_type !== "delete") return null;
  if (typeof b.owner_id !== "number") return null;
  if (typeof b.event_time !== "number") return null;

  return {
    object_type: b.object_type,
    object_id: b.object_id,
    aspect_type: b.aspect_type,
    owner_id: b.owner_id,
    event_time: b.event_time,
  };
}

// One-time handshake Strava performs when the app registers its webhook subscription (see the
// admin subscription endpoint, later phase) — and whenever Strava needs to reverify the
// callback URL. Not related to per-event authenticity: Strava does not sign POST deliveries,
// so the body below is trusted based on owner_id resolving to a known player, not on any
// request signature.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    console.log("Strava webhook: subscription handshake validated");
    return NextResponse.json({ "hub.challenge": challenge });
  }

  console.warn("Strava webhook: subscription handshake rejected (mode or verify_token mismatch)");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Must stay fast: identify the player, enqueue a job, acknowledge. All the actual work
// (Strava API calls, GPS/H3 processing) happens later in the worker
// (see services/activitySyncWorker.ts), never in this request.
//
// This route is intentionally Strava-specific — its request/response shape (hub.challenge,
// aspect_type, owner_id...) is Strava's own wire format, not a generic "provider webhook"
// abstraction. A future Garmin webhook would get its own route (/api/webhooks/garmin) with
// whatever shape Garmin actually uses; the two only share the same ActivitySyncJob queue and
// worker downstream of this parsing step.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.warn("Strava webhook: request body is not valid JSON");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = parseWebhookEvent(body);
  if (!event) {
    console.warn("Strava webhook: payload failed validation");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log(
    `Strava webhook: received ${event.aspect_type} ${event.object_type} ${event.object_id} (owner ${event.owner_id})`
  );

  // Strava also sends "athlete" events (e.g. deauthorization) through the same subscription.
  // We only ever import "activity" objects — anything else is acknowledged and dropped.
  if (event.object_type !== "activity") {
    console.log(`Strava webhook: ignoring non-activity object_type "${event.object_type}"`);
    return NextResponse.json({ ok: true });
  }

  const externalAccountId = String(event.owner_id);

  const connection = await prisma.externalConnection.findUnique({
    where: { providerAccount: { provider: STRAVA_PROVIDER, externalAccountId } },
    select: { playerId: true },
  });

  if (!connection) {
    console.warn(`Strava webhook: no player linked to Strava athlete ${event.owner_id}, ignoring event`);
    return NextResponse.json({ ok: true });
  }

  console.log(`Strava webhook: athlete ${event.owner_id} resolved to player ${connection.playerId}`);

  try {
    await prisma.activitySyncJob.create({
      data: {
        provider: STRAVA_PROVIDER,
        providerActivityId: String(event.object_id),
        externalAccountId,
        aspectType: event.aspect_type,
        eventTime: new Date(event.event_time * 1000),
      },
    });
    console.log(`Strava webhook: job queued for activity ${event.object_id} (${event.aspect_type})`);
  } catch (err) {
    // Unique constraint on (provider, providerActivityId, aspectType, eventTime): Strava
    // redelivered an event we already queued. Acknowledge without creating a second job.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.log(`Strava webhook: duplicate event for activity ${event.object_id} (${event.aspect_type}) ignored`);
      return NextResponse.json({ ok: true });
    }

    console.error("Strava webhook: failed to queue sync job", err);
    // Non-200 on a genuine failure (as opposed to a duplicate) lets Strava's own retry
    // mechanism redeliver the event a little later.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
