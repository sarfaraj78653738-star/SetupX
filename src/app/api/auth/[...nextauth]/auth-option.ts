import { experimental_defineAuth as defineAuth } from "next-auth";


const auth = defineAuth({
  providers: [],
  callbacks: {
    async authorized({ token, auth: a }) {
      // Authorized if there's a valid session token
      // For APIs that require subscription, check tier here
      return !!token;
    },
  },
  pages: {
    signIn: "/login",
  },
});

export { auth as requireAuth };
