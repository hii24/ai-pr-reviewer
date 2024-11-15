import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REVIEW_PROMPT = readFileSync(
  new URL("../prompts/review.md", import.meta.url),
  "utf8"
);

export async function reviewDiff({ diff, prTitle, prDescription, files }) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: REVIEW_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `# PR Title\n${prTitle}` },
          { type: "text", text: `# Description\n${prDescription || "_no description_"}` },
          { type: "text", text: `# Changed Files\n${files.map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n")}` },
          { type: "text", text: `# Diff\n\`\`\`diff\n${diff}\n\`\`\`` },
        ],
      },
    ],
  });

  return parseReviewResponse(message.content[0].text);
}

function parseReviewResponse(text) {
  const summaryMatch = text.match(/## Summary\n([\s\S]+?)(?:\n##|$)/);
  const riskMatch = text.match(/Risk Score:\s*(\d+)/i);
  const commentBlocks = [...text.matchAll(/### Line (\d+) \(([^)]+)\)\n([\s\S]+?)(?=\n###|\n##|$)/g)];

  return {
    summary: summaryMatch?.[1]?.trim() ?? text,
    riskScore: riskMatch ? Number(riskMatch[1]) : null,
    comments: commentBlocks.map((m) => ({
      line: Number(m[1]),
      file: m[2],
      body: m[3].trim(),
    })),
  };
}
