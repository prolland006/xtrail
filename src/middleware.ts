import i18nConfig from "./i18nConfig";
import { NextRequest } from "next/server";
import i18nRouter from "./helpers/i18nRouters/i18nRouter";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const session = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  return i18nRouter(req, i18nConfig, session);
}

// only applies this middleware to files in the app directory
export const config = {
  matcher: "/((?!api|static|.*\\..*|_next|fr/login|en/login).*)",
};
