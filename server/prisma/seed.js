import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const topics = [
  {
    name: 'Geography',
    questions: [
      {
        text: 'What is the capital of France?',
        optionA: 'Paris',
        optionB: 'London',
        optionC: 'Berlin',
        optionD: 'Madrid',
        correctOption: 'A'
      },
      {
        text: 'What is the capital of Japan?',
        optionA: 'Seoul',
        optionB: 'Tokyo',
        optionC: 'Beijing',
        optionD: 'Bangkok',
        correctOption: 'B'
      },
      {
        text: 'What is the capital of Australia?',
        optionA: 'Sydney',
        optionB: 'Melbourne',
        optionC: 'Canberra',
        optionD: 'Perth',
        correctOption: 'C'
      },
      {
        text: 'What is the capital of Brazil?',
        optionA: 'Rio de Janeiro',
        optionB: 'São Paulo',
        optionC: 'Brasília',
        optionD: 'Salvador',
        correctOption: 'C'
      },
      {
        text: 'Which is the largest ocean on Earth?',
        optionA: 'Atlantic',
        optionB: 'Indian',
        optionC: 'Pacific',
        optionD: 'Arctic',
        correctOption: 'C'
      },
      {
        text: 'Which country has the largest population?',
        optionA: 'India',
        optionB: 'United States',
        optionC: 'China',
        optionD: 'Indonesia',
        correctOption: 'A'
      },
      {
        text: 'What is the longest river in the world?',
        optionA: 'Amazon',
        optionB: 'Nile',
        optionC: 'Yangtze',
        optionD: 'Mississippi',
        correctOption: 'B'
      },
      {
        text: 'Which continent is the Sahara Desert on?',
        optionA: 'Asia',
        optionB: 'Africa',
        optionC: 'Australia',
        optionD: 'South America',
        correctOption: 'B'
      },
      {
        text: 'What is the capital of Canada?',
        optionA: 'Toronto',
        optionB: 'Vancouver',
        optionC: 'Ottawa',
        optionD: 'Montreal',
        correctOption: 'C'
      },
      {
        text: 'Mount Everest is located in which mountain range?',
        optionA: 'Alps',
        optionB: 'Andes',
        optionC: 'Himalayas',
        optionD: 'Rockies',
        correctOption: 'C'
      }
    ]
  },
  {
    name: 'Science',
    questions: [
      {
        text: 'What planet is known as the Red Planet?',
        optionA: 'Venus',
        optionB: 'Mars',
        optionC: 'Jupiter',
        optionD: 'Saturn',
        correctOption: 'B'
      },
      {
        text: 'What gas do plants absorb from the atmosphere?',
        optionA: 'Oxygen',
        optionB: 'Nitrogen',
        optionC: 'Carbon dioxide',
        optionD: 'Hydrogen',
        correctOption: 'C'
      },
      {
        text: 'What is the chemical symbol for water?',
        optionA: 'O2',
        optionB: 'CO2',
        optionC: 'H2O',
        optionD: 'NaCl',
        correctOption: 'C'
      },
      {
        text: 'How many bones are in the adult human body?',
        optionA: '106',
        optionB: '206',
        optionC: '306',
        optionD: '406',
        correctOption: 'B'
      },
      {
        text: 'What force keeps us on the ground?',
        optionA: 'Magnetism',
        optionB: 'Friction',
        optionC: 'Gravity',
        optionD: 'Inertia',
        correctOption: 'C'
      },
      {
        text: 'What is the center of an atom called?',
        optionA: 'Electron',
        optionB: 'Proton',
        optionC: 'Nucleus',
        optionD: 'Neutron',
        correctOption: 'C'
      },
      {
        text: 'Which organ pumps blood through the body?',
        optionA: 'Brain',
        optionB: 'Lungs',
        optionC: 'Heart',
        optionD: 'Kidney',
        correctOption: 'C'
      },
      {
        text: 'What is the speed of light approximately?',
        optionA: '300 km/s',
        optionB: '3,000 km/s',
        optionC: '300,000 km/s',
        optionD: '3,000,000 km/s',
        correctOption: 'C'
      },
      {
        text: 'Which vitamin is produced when skin is exposed to sunlight?',
        optionA: 'Vitamin A',
        optionB: 'Vitamin C',
        optionC: 'Vitamin D',
        optionD: 'Vitamin K',
        correctOption: 'C'
      },
      {
        text: 'What is the hardest natural substance on Earth?',
        optionA: 'Gold',
        optionB: 'Iron',
        optionC: 'Diamond',
        optionD: 'Quartz',
        correctOption: 'C'
      }
    ]
  },
  {
    name: 'History',
    questions: [
      {
        text: 'In which year did World War II end?',
        optionA: '1943',
        optionB: '1945',
        optionC: '1947',
        optionD: '1950',
        correctOption: 'B'
      },
      {
        text: 'Who was the first President of the United States?',
        optionA: 'Thomas Jefferson',
        optionB: 'Abraham Lincoln',
        optionC: 'George Washington',
        optionD: 'John Adams',
        correctOption: 'C'
      },
      {
        text: 'The Great Wall is located in which country?',
        optionA: 'Japan',
        optionB: 'China',
        optionC: 'Korea',
        optionD: 'Mongolia',
        correctOption: 'B'
      },
      {
        text: 'Who discovered penicillin?',
        optionA: 'Marie Curie',
        optionB: 'Alexander Fleming',
        optionC: 'Louis Pasteur',
        optionD: 'Isaac Newton',
        correctOption: 'B'
      },
      {
        text: 'Ancient Egyptian rulers were called what?',
        optionA: 'Emperors',
        optionB: 'Pharaohs',
        optionC: 'Sultans',
        optionD: 'Kings',
        correctOption: 'B'
      },
      {
        text: 'The Renaissance began in which country?',
        optionA: 'France',
        optionB: 'England',
        optionC: 'Italy',
        optionD: 'Spain',
        correctOption: 'C'
      },
      {
        text: 'Which empire built Machu Picchu?',
        optionA: 'Aztec',
        optionB: 'Maya',
        optionC: 'Inca',
        optionD: 'Olmec',
        correctOption: 'C'
      },
      {
        text: 'The Berlin Wall fell in which year?',
        optionA: '1987',
        optionB: '1989',
        optionC: '1991',
        optionD: '1993',
        correctOption: 'B'
      },
      {
        text: 'Who wrote the Declaration of Independence?',
        optionA: 'Benjamin Franklin',
        optionB: 'Thomas Jefferson',
        optionC: 'George Washington',
        optionD: 'John Hancock',
        correctOption: 'B'
      },
      {
        text: 'Which ancient civilization used hieroglyphics?',
        optionA: 'Roman',
        optionB: 'Greek',
        optionC: 'Egyptian',
        optionD: 'Persian',
        correctOption: 'C'
      }
    ]
  }
];

async function main() {
  console.log('Seeding database...');

  for (const topicData of topics) {
    const topic = await prisma.topic.upsert({
      where: { name: topicData.name },
      update: {},
      create: { name: topicData.name }
    });

    await prisma.question.deleteMany({ where: { topicId: topic.id } });

    for (const question of topicData.questions) {
      await prisma.question.create({
        data: {
          topicId: topic.id,
          ...question
        }
      });
    }

    console.log(`Added ${topicData.questions.length} questions for ${topicData.name}`);
  }

  console.log('Done!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
