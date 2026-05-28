import { auth } from '@/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!req.auth && !pathname.startsWith('/api/auth') && pathname !== '/login') {
    return Response.redirect(new URL('/login', req.nextUrl.origin));
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
