import { ReviewComposer } from '@/components/ReviewComposer';

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: 40 }}>
      <h1>Compose review</h1>
      <ReviewComposer reviewId={id} />
    </main>
  );
}
