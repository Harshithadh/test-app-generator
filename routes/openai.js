const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// POST /openai/generate-tests
router.post("/generate-tests", async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Code is required" });
    }

    try {
        const prompt = `You are an expert software tester. Given the following source code, generate meaningful unit tests in JavaScript using Jest. Include test descriptions and edge cases.

Code:
${code}

Tests:
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: "You are a helpful software testing assistant." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2,
        });

        const responseText = completion.choices[0].message.content;
        res.json({ testCases: responseText });
    } catch (err) {
        console.error("OpenAI Error:", err.message);
        res.status(500).json({ error: "Failed to generate test cases" });
    }
});

module.exports = router;
