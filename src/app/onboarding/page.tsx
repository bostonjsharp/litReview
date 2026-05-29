import { WorkspaceOnboarding } from '@/components/WorkspaceOnboarding';

export default function OnboardingPage() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Welcome to LitReview</h1>
      <p>Create a workspace for your team, or join one with an invite code.</p>
      <WorkspaceOnboarding />
    </main>
  );
}
