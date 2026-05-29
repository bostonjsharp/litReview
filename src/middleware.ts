import { auth } from '@/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join/') ||
    pathname.startsWith('/api/auth');
  if (!req.auth && !isPublic) {
    return Response.redirect(new URL('/login', req.nextUrl.origin));
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
