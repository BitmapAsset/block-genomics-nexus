import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text, question, history } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-key-here') {
    return NextResponse.json({
      answer: `**Demo Mode**: You asked "${question}". To get real AI answers, add your OpenAI API key to the .env file. The document has ${text.length} characters.`,
    });
  }

  try {
    const messages = [
      { role: 'system' as const, content: `You answer questions about a document. Here is the document text:\n\n${text.slice(0, 10000)}` },
      ...(history || []),
      { role: 'user' as const, content: question },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 1000 }),
    });
    const data = await response.json();
    return NextResponse.json({ answer: data.choices[0].message.content });
  } catch {
    return NextResponse.json({ answer: 'Error generating answer. Please try again.' }, { status: 500 });
  }
}
