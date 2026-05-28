import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';

const Body = z.object({ name: z.string().min(1), researchQuestion: z.string().optional() });

export async function GET() {
  await requireUser();
  const rows = await db.select().from(schema.collections);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  const [row] = await db
    .insert(schema.collections)
    .values({ name: body.name, researchQuestion: body.researchQuestion, createdBy: user.id })
    .returning();
  return Response.json(row, { status: 201 });
}
