import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { getPullRequestContext, postReview } from "./github.js";
import { reviewDiff } from "./claude.js";

const app = express();
app.use(express.json({ verify: rawBody }));

function rawBody(req, _res, buf) {
  req.rawBody = buf.toString("utf8");
}

function verifySignature(req) {
  const signature = req.header("x-hub-signature-256");
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post("/webhook/pr-review", async (req, res) => {
  if (!verifySignature(req)) return res.status(401).send("invalid signature");

  const { action, pull_request, repository } = req.body;
  if (!["opened", "synchronize", "reopened"].includes(action)) {
    return res.status(204).end();
  }

  res.status(202).send("review queued");

  try {
    const context = await getPullRequestContext({
      owner: repository.owner.login,
      repo: repository.name,
      prNumber: pull_request.number,
    });

    const review = await reviewDiff(context);

    await postReview({
      owner: repository.owner.login,
      repo: repository.name,
      prNumber: pull_request.number,
      headSha: context.headSha,
      review,
    });
  } catch (err) {
    console.error("review failed:", err);
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`ai-pr-reviewer listening on :${port}`));
