import { signIn } from '@/auth';

export default function Login() {
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
      >
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
