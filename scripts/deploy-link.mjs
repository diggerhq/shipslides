const value = process.argv[2];
if (!value) throw new Error("Usage: node scripts/deploy-link.mjs https://github.com/OWNER/REPOSITORY");
const url = new URL(value);
if (url.protocol !== "https:" || url.hostname !== "github.com" || !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error("Use an HTTPS GitHub repository URL.");
const repository = url.href.replace(/\/$/, "");
console.log(`https://app.opencomputer.dev/new?repository-url=${encodeURIComponent(repository)}`);
console.log(`npx opencomputer template deploy ${repository}`);
