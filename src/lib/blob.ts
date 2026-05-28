import { put } from '@vercel/blob';

export async function uploadPdf(filename: string, bytes: Uint8Array): Promise<string> {
  const { url } = await put(`pdfs/${Date.now()}-${filename}`, Buffer.from(bytes), {
    access: 'public',
    contentType: 'application/pdf',
  });
  return url;
}
