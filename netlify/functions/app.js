 exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OPENAI_API_KEY is not configured on the server."
        })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const action = body.action || "generate_exam";

    if (action !== "generate_exam") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unknown action." })
      };
    }

    const topic = body.topic || "English grammar";
    const questionType = body.questionType || "multiple-choice";
    const count = Number(body.count || 5);
    const level = body.level || "B1";

    const safeCount = Math.max(1, Math.min(count, 15));

    const prompt = `
You are an expert English exam question writer.

Create ${safeCount} ${questionType} questions about: ${topic}.
Level: ${level}.

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "answer": "Correct answer",
      "explanation": "Short explanation"
    }
  ]
}

Rules:
- Questions must be clear and exam-style.
- Options must be plausible.
- If the question type is multiple-choice, provide exactly 4 options.
- The answer must match one of the options.
- Do not include markdown.
- Do not include extra text outside JSON.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        temperature: 0.4
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: result.error?.message || "OpenAI request failed"
        })
      };
    }

    const text =
      result.output_text ||
      result.output?.[0]?.content?.[0]?.text ||
      "";

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "AI returned invalid JSON.",
          raw: text
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "Unexpected server error"
      })
    };
  }
};