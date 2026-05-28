import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of ['Page one about neural networks.', 'Page two about transformers.']) {
    const page = doc.addPage([300, 200]);
    page.drawText(line, { x: 20, y: 150, size: 12, font });
  }
  writeFileSync('tests/fixtures/sample.pdf', await doc.save());
  console.log('wrote tests/fixtures/sample.pdf');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
