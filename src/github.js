import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function getPullRequestContext({ owner, repo, prNumber }) {
  const [pr, files, diff] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    }),
  ]);

  return {
    prTitle: pr.data.title,
    prDescription: pr.data.body,
    files: files.data,
    diff: diff.data,
    headSha: pr.data.head.sha,
  };
}

export async function postReview({ owner, repo, prNumber, headSha, review }) {
  const body = formatSummaryBody(review);

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    event: review.riskScore >= 7 ? "REQUEST_CHANGES" : "COMMENT",
    body,
    comments: review.comments.map((c) => ({
      path: c.file,
      line: c.line,
      body: c.body,
    })),
  });
}

function formatSummaryBody({ summary, riskScore }) {
  const emoji = riskScore < 4 ? "✅" : riskScore < 7 ? "⚠️" : "🚨";
  return `## 🤖 AI Code Review · Risk Score: ${riskScore ?? "?"}/10 · ${emoji}\n\n${summary}\n\n---\n_Reviewed by [ai-pr-reviewer](https://github.com/hii24/ai-pr-reviewer)_`;
}
