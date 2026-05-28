import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowed } from '@/lib/allowlist';

export { isAllowed };

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return isAllowed(profile?.email, process.env.ALLOWED_EMAILS);
    },
  },
});
