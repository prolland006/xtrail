import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Player } from "@prisma/client";

/**
 * Bridges the current session to a real Player row.
 *
 * There is no signup flow yet — login is a single hardcoded credentials check (see
 * Login.tsx) — so this is a stand-in: it get-or-creates a Player from whatever the
 * session has, keyed on email (the one field the dummy login reliably provides). Once
 * real registration exists, replace this with a direct session -> Player.id lookup; the
 * rest of the pipeline (services/activityImport.ts, services/territory.ts) already only
 * ever takes a playerId as input, so nothing downstream needs to change.
 *
 * Returns null if there's no session — callers decide what that means for them.
 */
export async function getOrCreatePlayerForSession(): Promise<Player | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  // The dummy credentials login sets `name` to whatever the password field contained —
  // not a real name. Good enough as a placeholder until real signup supplies firstName/
  // lastName directly (see the constraints from the earlier data-model task).
  const [firstName, ...rest] = (session.user.name || "Joueur").split(" ");

  return prisma.player.upsert({
    where: { email: session.user.email },
    update: {},
    create: {
      email: session.user.email,
      firstName: firstName || "Joueur",
      lastName: rest.join(" ") || "Xtrail",
      photoUrl: session.user.image || "",
    },
  });
}
