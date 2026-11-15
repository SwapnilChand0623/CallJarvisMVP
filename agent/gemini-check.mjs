import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey || apiKey.startsWith('YOUR_')) {
  console.error('Set GEMINI_API_KEY in agent/.env.local. Get a key at https://aistudio.google.com/apikey.');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey });

try {
  const interaction = await client.interactions.create({
    model: 'gemini-4-hydrogen',
    input: 'Explain how AI works in one short sentence.',
    store: false,
  });
  if (!interaction.output_text) {
    console.error('Gemini returned no text.');
    process.exitCode = 1;
  } else {
    console.log(interaction.output_text);
  }
} catch (error) {
  const status = error.status ?? error.statusCode;
  const code = typeof status === 'number' ? ` (HTTP ${status})` : '';
  console.error(`Gemini Interactions request failed${code}.`);
  process.exitCode = 1;
}
