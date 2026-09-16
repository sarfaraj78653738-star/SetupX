import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getUserByEmail } from "@/lib/users";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string | null;
    subscriptionTier: "free" | "pro" | "premium" | null;
    subscriptionStatus: "active" | "canceled" | "past_due" | null;
    subscriptionEndsAt: Date | null;
    isAdmin: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      subscriptionTier: "free" | "pro" | "premium" | null;
      subscriptionStatus: "active" | "canceled" | "past_due" | null;
      subscriptionEndsAt: Date | null;
      isAdmin: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    subscriptionTier: "free" | "pro" | "premium" | null;
    subscriptionStatus: "active" | "canceled" | "past_due" | null;
    subscriptionEndsAt: Date | null;
    isAdmin: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await getUserByEmail(email);
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionEndsAt: user.subscriptionEndsAt
            ? new Date(user.subscriptionEndsAt)
            : null,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.subscriptionTier = user.subscriptionTier;
        token.subscriptionStatus = user.subscriptionStatus;
        token.subscriptionEndsAt = user.subscriptionEndsAt;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.subscriptionTier = token.subscriptionTier;
        session.user.subscriptionStatus = token.subscriptionStatus;
        session.user.subscriptionEndsAt = token.subscriptionEndsAt;
        session.user.isAdmin = token.isAdmin;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.AUTH_SECRET,
});
