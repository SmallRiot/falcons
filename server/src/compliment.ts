import Anthropic from '@anthropic-ai/sdk';

/**
 * «Респект в чате»: Claude пишет короткий тёплый комплимент игроку по фактам о нём.
 * Нужен ANTHROPIC_API_KEY в .env. Без ключа или при ошибке — вернётся null, и бот возьмёт запасной шаблон.
 */
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 25_000, maxRetries: 1 }) : null;

export type PlayerFacts = {
  name: string;
  position: string | null;
  number: number | null;
  squads: string[];
  trainings30: number;
  games30: number;
  attendancePct: number | null;
  goals: number;
  bigWin: number | null;
};

// Случайная «тема дня» — чтобы комплименты не повторялись
const ANGLES = [
  'катание и скорость',
  'бросок и чутьё на ворота',
  'пасы и видение площадки',
  'характер и командный дух',
  'стабильность и то, что всегда приходит на лёд',
  'юмор в раздевалке',
  'стиль и уверенность',
  'работа в обороне и самоотдача',
  'рост за сезон',
  'то, как он заряжает остальных',
];

const SYSTEM = `Ты — бот любительской хоккейной команды Falcons из Тбилиси. Игрок выкупил в магазине «Респект в чате», и ты пишешь ему комплимент для командного чата.

Требования:
- одна-две фразы, до 220 символов, на русском, на «ты», по-дружески и с юмором;
- опирайся на факты об игроке и на тему дня; не выдумывай цифры и события, которых нет в фактах;
- если фактов мало, хвали характер и командный дух, а не статистику;
- без оскорблений, сарказма в адрес игрока, хештегов, кавычек и приветствий;
- можно одно-два эмодзи.
В ответе — только текст комплимента.`;

export async function writeCompliment(f: PlayerFacts): Promise<string | null> {
  if (!client) return null;
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const facts = [
    `Имя: ${f.name}`,
    f.position ? `Позиция: ${f.position}` : null,
    f.number != null ? `Номер: ${f.number}` : null,
    f.squads.length ? `Составы: ${f.squads.join(', ')}` : null,
    `За 30 дней: тренировок ${f.trainings30}, игр ${f.games30}${f.attendancePct != null ? `, посещаемость ${f.attendancePct}%` : ''}`,
    f.goals ? `Голов записано в игре клуба: ${f.goals}` : null,
    f.bigWin ? `Ловил в «Ледовом дропе» попадание ${f.bigWin}×` : null,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `${facts}\n\nТема дня: ${angle}` }],
    });
    if (res.stop_reason === 'refusal') return null;
    const text = res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
      .replace(/^["«»]+|["«»]+$/g, '');
    return text ? text.slice(0, 400) : null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.warn(`[compliment] API ${e.status}: ${e.message}`);
    else console.warn('[compliment] failed', (e as Error).message);
    return null;
  }
}
