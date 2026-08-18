import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.join(__dirname, '..', 'data', 'questions.csv');

const REQUIRED_COLUMNS = ['topic', 'correct'];

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

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

function normalizeImageUrl(imageValue, fieldName, lineNumber) {
  if (!imageValue) return null;

  const trimmed = imageValue.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error(
      `Row ${lineNumber}: ${fieldName} must be a full https:// URL (got "${trimmed}").`
    );
  }

  return trimmed;
}

function readOption(row, letter) {
  const text = row[`option${letter}`]?.trim() || '';
  const imageUrl = normalizeImageUrl(
    row[`option${letter}ImageUrl`] || '',
    `option${letter}ImageUrl`,
    row.__lineNumber
  );

  if (!text && !imageUrl) {
    throw new Error(`Row ${row.__lineNumber}: option${letter} needs text and/or option${letter}ImageUrl.`);
  }

  return { text, imageUrl };
}

function validateRow(row, lineNumber) {
  row.__lineNumber = lineNumber;

  for (const column of REQUIRED_COLUMNS) {
    if (!row[column]) {
      throw new Error(`Row ${lineNumber}: missing required column "${column}".`);
    }
  }

  const correct = row.correct.trim().toUpperCase();
  if (!OPTION_KEYS.includes(correct)) {
    throw new Error(`Row ${lineNumber}: correct must be A, B, C, or D.`);
  }

  const text = row.text?.trim() || '';
  const imageUrl = normalizeImageUrl(row.imageUrl || row.image || '', 'imageUrl', lineNumber);

  if (!text && !imageUrl) {
    throw new Error(`Row ${lineNumber}: provide question text and/or imageUrl.`);
  }

  const optionA = readOption(row, 'A');
  const optionB = readOption(row, 'B');
  const optionC = readOption(row, 'C');
  const optionD = readOption(row, 'D');

  return {
    topic: row.topic.trim(),
    text,
    imageUrl,
    optionA: optionA.text,
    optionB: optionB.text,
    optionC: optionC.text,
    optionD: optionD.text,
    optionAImageUrl: optionA.imageUrl,
    optionBImageUrl: optionB.imageUrl,
    optionCImageUrl: optionC.imageUrl,
    optionDImageUrl: optionD.imageUrl,
    correctOption: correct
  };
}

function questionLookupWhere(topicId, question) {
  if (question.text) {
    return { topicId, text: question.text };
  }

  return { topicId, text: '', imageUrl: question.imageUrl };
}

async function upsertQuestion(topicId, question) {
  const existing = await prisma.question.findFirst({
    where: questionLookupWhere(topicId, question)
  });

  const data = {
    text: question.text,
    imageUrl: question.imageUrl,
    optionA: question.optionA,
    optionB: question.optionB,
    optionC: question.optionC,
    optionD: question.optionD,
    optionAImageUrl: question.optionAImageUrl,
    optionBImageUrl: question.optionBImageUrl,
    optionCImageUrl: question.optionCImageUrl,
    optionDImageUrl: question.optionDImageUrl,
    correctOption: question.correctOption
  };

  if (existing) {
    return prisma.question.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.question.create({
    data: {
      topicId,
      ...data
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

  for (let index = 0; index < records.length; index += 1) {
    const question = validateRow(records[index], index + 2);

    let topic = await prisma.topic.findUnique({ where: { name: question.topic } });
    if (!topic) {
      topic = await prisma.topic.create({ data: { name: question.topic } });
      console.log(`Created topic: ${question.topic}`);
    }

    const before = await prisma.question.findFirst({
      where: questionLookupWhere(topic.id, question)
    });

    await upsertQuestion(topic.id, question);

    if (before) updated += 1;
    else created += 1;
  }

  console.log(`Import complete: ${created} created, ${updated} updated.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
