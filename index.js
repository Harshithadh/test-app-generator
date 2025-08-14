// apps/backend/index.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const { Octokit } = require("@octokit/rest");

const app = express();
app.use(cors());
app.use(express.json());

// ➤ Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ➤ GitHub OAuth Callback
app.get("/auth/github/callback", async (req, res) => {
    const code = req.query.code;

    try {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json();
        const [userRes, reposRes] = await Promise.all([
            fetch("https://api.github.com/user", {
                headers: { Authorization: `token ${tokenData.access_token}` },
            }),
            fetch("https://api.github.com/user/repos", {
                headers: { Authorization: `token ${tokenData.access_token}` },
            }),
        ]);

        const user = await userRes.json();
        const repos = await reposRes.json();

        res.json({
            user: {
                ...user,
                token: tokenData.access_token,
            },
            repos,
        });
    } catch (err) {
        console.error("🔴 GitHub OAuth Error:", err);
        res.status(500).json({ error: "GitHub authentication failed." });
    }
});

// ➤ AI-Powered Test Case Generator
app.post("/api/generate-test", async (req, res) => {
    const { fileContent, fileName } = req.body;

    if (!fileContent || !fileName) {
        return res.status(400).json({ error: "Missing fileContent or fileName." });
    }

    const prompt = `
Generate clean and maintainable Jest unit test cases for the following JavaScript file.

Filename: ${fileName}

\`\`\`javascript
${fileContent}
\`\`\`

Only return the Jest test code without explanations.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are an expert JavaScript developer skilled at writing Jest test cases.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.4,
        });

        const testCode = response.choices[0].message.content;
        res.json({ testCode });
    } catch (err) {
        console.error("🔴 OpenAI API Error:", err);
        res.status(500).json({ error: "Failed to generate test cases." });
    }
});

// ➤ Create Pull Request with Generated Tests
app.post("/api/create-pr", async (req, res) => {
    const { filePath, testCode, repoFullName, token } = req.body;

    try {
        const octokit = new Octokit({ auth: token });
        const [owner, repo] = repoFullName.split("/");

        // Get default branch
        const { data: repoInfo } = await octokit.repos.get({ owner, repo });
        const defaultBranch = repoInfo.default_branch;

        // Get latest commit SHA
        const { data: refData } = await octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${defaultBranch}`,
        });

        const latestCommitSha = refData.object.sha;

        // Create a new branch
        const branchName = `test-cases-${Date.now()}`;
        await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branchName}`,
            sha: latestCommitSha,
        });

        // Create blob with new test content
        const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: testCode,
            encoding: "utf-8",
        });

        // Get latest tree
        const { data: latestCommit } = await octokit.git.getCommit({
            owner,
            repo,
            commit_sha: latestCommitSha,
        });

        const testFilePath = filePath.replace(".js", ".test.js");

        // Create new tree
        const { data: newTree } = await octokit.git.createTree({
            owner,
            repo,
            base_tree: latestCommit.tree.sha,
            tree: [
                {
                    path: testFilePath,
                    mode: "100644",
                    type: "blob",
                    sha: blob.sha,
                },
            ],
        });

        // Create new commit
        const { data: newCommit } = await octokit.git.createCommit({
            owner,
            repo,
            message: `✅ Add Jest test cases for ${filePath}`,
            tree: newTree.sha,
            parents: [latestCommitSha],
        });

        // Update the new branch
        await octokit.git.updateRef({
            owner,
            repo,
            ref: `heads/${branchName}`,
            sha: newCommit.sha,
        });

        // Create pull request
        const { data: pr } = await octokit.pulls.create({
            owner,
            repo,
            title: `Add Jest test cases for ${filePath}`,
            head: branchName,
            base: defaultBranch,
            body: "This PR adds unit test cases generated by AI.",
        });

        res.json({ pullRequestUrl: pr.html_url });
    } catch (err) {
        console.error("PR Creation Error:", err);
        res.status(500).json({ error: "Failed to create pull request." });
    }
});

// ➤ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Backend is running on http://localhost:${PORT}`);
});
