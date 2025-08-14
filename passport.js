const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;

passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(
    new GitHubStrategy(
        {
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: 'http://localhost:5000/auth/github/callback',
        },
        (accessToken, refreshToken, profile, done) => {
            const user = {
                id: profile.id,
                username: profile.username,
                displayName: profile.displayName,
                avatar: profile.photos?.[0]?.value,
                accessToken, // ⬅️ needed to fetch GitHub APIs
            };
            return done(null, user);
        }
    )
);

module.exports = passport;
