import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        try {
          // axios fetch user token
          if (credentials?.email === "patrice@yahoo.fr")
            return {
              id: "id",
              name: credentials?.password,
              email: credentials?.email,
              token: "accessToken",
            };
        } catch (error) {
          console.error(`Unexpected error: ${error}`);
        }
        return null;
      },
    }),
  ],
  session: {
    maxAge: 60 * 60 * 24,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.token;
      }
      return { ...token, ...user };
    },
    async session({ session, token }) {
      session.user.accessToken = token.accessToken as string;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
