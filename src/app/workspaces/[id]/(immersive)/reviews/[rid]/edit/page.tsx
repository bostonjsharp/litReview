import { ReviewComposer } from '@/components/ReviewComposer';

export default async function EditReviewPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { rid } = await params;
  return (
    <main style={{ padding: 40 }}>
      <h1>Compose review</h1>
      <ReviewComposer reviewId={rid} />
    </main>
  );
}
