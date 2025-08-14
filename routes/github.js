const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { Octokit } = require("@octokit/rest");

const router = express.Router();

// Passport session setup
passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Use GitHub strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: 'http://localhost:5000/auth/github/callback'
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

// Step 1: Redirect to GitHub
router.get('/github', passport.authenticate('github', { scope: ['repo'] }));

// Step 2: GitHub redirects here after login
router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: '/' }),
    (req, res) => {
        res.send(`
            <h2>Login successful ✅</h2>
            <p>You can now use the token to list repos.</p>
        `);
    }
);

// ✅ Profile route
router.get('/profile', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    res.json({
        username: req.user.username,
        avatar: req.user.photos?.[0]?.value,
        token: req.user.accessToken
    });
});

// ✅ Repos route
router.get('/repos', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const octokit = new Octokit({ auth: req.user.accessToken });

    try {
        const response = await octokit.repos.listForAuthenticatedUser({
            per_page: 100,
        });

        const repos = response.data.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            owner: repo.owner.login,
        }));

        res.json(repos);
    } catch (err) {
        console.error('Error fetching repos:', err);
        res.status(500).json({ error: 'Failed to fetch repos' });
    }
});
// GET /github/files?repoFullName=owner/repo
router.get("/files", async (req, res) => {
    const { repoFullName } = req.query;
    const token = req.headers.authorization?.split(" ")[1];

    try {
        const treeRes = await axios.get(`https://api.github.com/repos/${repoFullName}/git/trees/main?recursive=1`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const files = treeRes.data.tree.filter((item) => item.type === "blob");
        res.json(files);
    } catch (error) {
        console.error("Error fetching files:", error.message);
        res.status(500).json({ error: "Failed to fetch files" });
    }
});

// ✅ Files route
router.get('/files/:owner/:repo', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const { owner, repo } = req.params;
    const octokit = new Octokit({ auth: req.user.accessToken });

    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: "", // root folder
        });

        const files = data
            .filter(file => file.type === "file" && /\.(js|ts|jsx|tsx|py)$/.test(file.name))
            .map(file => ({
                name: file.name,
                path: file.path,
            }));

        res.json(files);
    } catch (err) {
        console.error('Error fetching files:', err);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

module.exports = router;
// GET /github/file-content?repoFullName=owner/repo&filePath=src/index.js
router.get("/file-content", async (req, res) => {
    const { repoFullName, filePath } = req.query;
    const token = req.headers.authorization?.split(" ")[1];

    try {
        const contentRes = await axios.get(`https://api.github.com/repos/${repoFullName}/contents/${filePath}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const content = Buffer.from(contentRes.data.content, "base64").toString("utf-8");
        res.json({ content });
    } catch (error) {
        console.error("Error fetching file content:", error.message);
        res.status(500).json({ error: "Failed to fetch file content" });
    }
});
