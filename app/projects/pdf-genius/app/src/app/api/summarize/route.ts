import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-key-here') {
    // Mock response when no API key
    return NextResponse.json({
      summary: `**Summary (Demo Mode)**\n\nThis is a placeholder summary. To enable real AI summaries, add your OpenAI API key to the .env file.\n\nThe uploaded document contains approximately ${text.length} characters of text. Key topics would be extracted and summarized here with a real API key.`,
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes documents concisely. Provide a clear, well-structured summary with key points.' },
          { role: 'user', content: `Summarize the following document:\n\n${text.slice(0, 12000)}` },
        ],
        max_tokens: 1000,
      }),
    });
    const data = await response.json();
    return NextResponse.json({ summary: data.choices[0].message.content });
  } catch {
    return NextResponse.json({ summary: 'Error generating summary. Please try again.' }, { status: 500 });
  }
}
