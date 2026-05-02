 exports.handler = async function (event) {
  const { topic, type, count } = JSON.parse(event.body);

  const prompt = `
Create ${count} ${type} questions about "${topic}".
Make them suitable for high school students.
Each question must have 4 options (A, B, C, D).
Mark the correct answer.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": Bearer ${process.env.OPENAI_API_KEY}
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional English teacher." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        result: data.choices[0].message.content
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI error" })
    };
  }
};