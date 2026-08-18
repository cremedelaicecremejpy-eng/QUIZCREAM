import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const csvPath = path.join(projectRoot, 'data', 'questions.csv');
const imagesRoot = path.join(projectRoot, 'public', 'images');

const REQUIRED_COLUMNS = [
  'topic',
  'text',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correct'
];

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index]?.trim() || '';
    });
    return record;
  });
}

function normalizeImageUrl(imageValue) {
  if (!imageValue) return null;

  const trimmed = imageValue.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('/images/')) {
    return trimmed;
  }

  return `/images/${trimmed.replace(/^\/+/, '')}`;
}

function imageFileExists(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/images/')) return true;

  const relativePath = imageUrl.slice('/images/'.length);
  const filePath = path.join(imagesRoot, relativePath);
  return fs.existsSync(filePath);
}

function validateRow(row, lineNumber) {
  for (const column of REQUIRED_COLUMNS) {
    if (!row[column]) {
      throw new Error(`Row ${lineNumber}: missing required column "${column}".`);
    }
  }

  const correct = row.correct.trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(correct)) {
    throw new Error(`Row ${lineNumber}: correct must be A, B, C, or D.`);
  }

  return {
    topic: row.topic.trim(),
    text: row.text.trim(),
    optionA: row.optionA.trim(),
    optionB: row.optionB.trim(),
    optionC: row.optionC.trim(),
    optionD: row.optionD.trim(),
    correctOption: correct,
    imageUrl: normalizeImageUrl(row.image || row.imageUrl || '')
  };
}

async function upsertQuestion(topicId, question) {
  const existing = await prisma.question.findFirst({
    where: {
      topicId,
      text: question.text
    }
  });

  if (existing) {
    return prisma.question.update({
      where: { id: existing.id },
      data: {
        optionA: question.optionA,
        optionB: question.optionB,
        optionC: question.optionC,
        optionD: question.optionD,
        correctOption: question.correctOption,
        imageUrl: question.imageUrl
      }
    });
  }

  return prisma.question.create({
    data: {
      topicId,
      text: question.text,
      optionA: question.optionA,
      optionB: question.optionB,
      optionC: question.optionC,
      optionD: question.optionD,
      correctOption: question.correctOption,
      imageUrl: question.imageUrl
    }
  });
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parseCsv(content);

  if (records.length === 0) {
    throw new Error('CSV has no question rows.');
  }

  let created = 0;
  let updated = 0;
  let withImages = 0;
  let missingImages = 0;

  for (let index = 0; index < records.length; index += 1) {
    const question = validateRow(records[index], index + 2);

    let topic = await prisma.topic.findUnique({ where: { name: question.topic } });
    if (!topic) {
      topic = await prisma.topic.create({ data: { name: question.topic } });
      console.log(`Created topic: ${question.topic}`);
    }

    const before = await prisma.question.findFirst({
      where: { topicId: topic.id, text: question.text }
    });

    if (question.imageUrl && !imageFileExists(question.imageUrl)) {
      console.warn(`Warning row ${index + 2}: image not found for ${question.imageUrl}`);
      missingImages += 1;
    }

    await upsertQuestion(topic.id, question);

    if (question.imageUrl) withImages += 1;
    if (before) updated += 1;
    else created += 1;
  }

  console.log(`Import complete: ${created} created, ${updated} updated, ${withImages} with images.`);
  if (missingImages > 0) {
    console.log(`${missingImages} row(s) reference image files that are not in server/public/images yet.`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
