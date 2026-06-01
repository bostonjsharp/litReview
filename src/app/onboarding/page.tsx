import { WorkspaceOnboarding } from "@/components/WorkspaceOnboarding";

export default function OnboardingPage() {
  return (
    <div className="onb-stage">
      <div className="onb-wrap fade-enter">
        <div className="onb-head">
          <div className="eyebrow">Step 1 of 1 · Set up</div>
          <h1>Find your workspace</h1>
          <p>Create a shared space for your lab, or join one with an invite code.</p>
        </div>
        <WorkspaceOnboarding />
        <div className="onb-foot">You can belong to several workspaces and switch between them anytime.</div>
      </div>
    </div>
  );
}
