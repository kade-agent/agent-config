#!/usr/bin/env node
// The PR body convention (repo-workflow SKILL.md, 4. Commit and pull request).
//   node pr-body.cjs check [--public] [file]   errors on stderr, exit 1 if any
//   node pr-body.cjs extract [file]            the sections as JSON on stdout
// The body comes from the file, or stdin: gh pr view <n> -R <owner>/<repo> --json body --jq .body
"use strict";

const fs = require("fs");

const HEADINGS = ["What changed and why", "Verified", "NOT VERIFIED", "Kade's steps", "Follow-ups", "Placeholders", "Wrong turns"];
const REF = "[\\w.-]+/[\\w.-]+#\\d+";
const LINE1 = new RegExp(`^(Closes|Part of) (${REF}(?:, ${REF})*)$`);
const LINE2 = /^Task: (\S+)(?: · Plan: (\S+\.md@[0-9a-f]{40}))?$/;
const NOT_VERIFIED = /^- NOT VERIFIED: (.+?): (.+)$/;
const STEP = /^- \[( |x|X)\] (.+)$/;

function parse(body) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  // The Claude Code footer closes the body; it is no part of the last section.
  const footer = lines.findIndex((l) => l.startsWith("🤖 Generated with"));
  if (footer >= 0) lines.length = footer;
  const sections = [];
  let fence = false;
  for (const [i, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^## (.+?)\s*$/.exec(line);
    if (h) sections.push({ name: h[1], line: i + 1, body: [] });
    else if (sections.length) sections[sections.length - 1].body.push(line);
  }
  for (const s of sections) s.text = s.body.join("\n").trim();
  return { lines, sections };
}

function check(body, opts = {}) {
  const { lines, sections } = parse(body);
  const errors = [];
  if (!LINE1.test(lines[0] || "")) errors.push("line 1: must be `Closes <owner>/<repo>#<n>` (or `Part of`), never a bare #<n>");
  const task = LINE2.exec(lines[1] || "");
  if (!task) errors.push("line 2: must be `Task: <ID>` (or `none`), then ` · Plan: <path>.md@<full 40-character sha>`");
  else if (opts.public && task[2]) errors.push("line 2: a public repository names no plan path, only `Task: <ID>`");
  for (const s of sections) {
    if (!HEADINGS.includes(s.name)) errors.push(`line ${s.line}: \`## ${s.name}\` is not a heading of the convention`);
  }
  const found = sections.filter((s) => HEADINGS.includes(s.name)).map((s) => s.name);
  for (const h of HEADINGS) if (!found.includes(h)) errors.push(`\`## ${h}\` is missing`);
  if (found.join("\n") !== HEADINGS.filter((h) => found.includes(h)).join("\n") || new Set(found).size !== found.length) {
    errors.push(`the headings must appear once each, in this order: ${HEADINGS.join(", ")}`);
  }
  for (const s of sections.filter((x) => HEADINGS.includes(x.name))) {
    if (!s.text) { errors.push(`\`## ${s.name}\` is empty: write None`); continue; }
    if (s.text === "None") continue;
    const items = s.body.filter((l) => l.startsWith("- "));
    if (s.name === "NOT VERIFIED") {
      for (const l of s.body.filter((x) => x.trim() && !/^\s/.test(x))) {
        if (!NOT_VERIFIED.test(l)) errors.push(`NOT VERIFIED: \`${l}\` must be \`- NOT VERIFIED: <gate>: <reason>\``);
      }
    }
    if (s.name === "Kade's steps") {
      for (const l of items) if (!STEP.test(l)) errors.push(`Kade's steps: \`${l}\` must be a checklist item, \`- [ ] <step>\``);
    }
  }
  return errors;
}

const list = (s, re = /^- (.+)$/) => (!s || s.text === "None" ? [] : s.body.map((l) => re.exec(l)).filter(Boolean));

function extract(body) {
  const { lines, sections } = parse(body);
  const get = (name) => sections.find((s) => s.name === name);
  const l1 = LINE1.exec(lines[0] || "");
  const l2 = LINE2.exec(lines[1] || "");
  return {
    errors: check(body),
    closes: l1 ? l1[2].split(", ") : [],
    task: l2 && l2[1] !== "none" ? l2[1] : null,
    plan: l2 && l2[2] ? l2[2] : null,
    whatChanged: get("What changed and why")?.text ?? null,
    verified: get("Verified")?.text ?? null,
    notVerified: list(get("NOT VERIFIED"), NOT_VERIFIED).map((m) => ({ gate: m[1], reason: m[2] })),
    kadesSteps: list(get("Kade's steps"), STEP).map((m) => ({ done: m[1] !== " ", text: m[2] })),
    followUps: list(get("Follow-ups")).map((m) => m[1]),
    placeholders: list(get("Placeholders")).map((m) => m[1]),
    wrongTurns: get("Wrong turns")?.text ?? null,
  };
}

module.exports = { HEADINGS, check, extract };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const file = rest.find((a) => !a.startsWith("--"));
  const body = fs.readFileSync(file ?? 0, "utf8");
  if (cmd === "check") {
    const errors = check(body, { public: rest.includes("--public") });
    for (const e of errors) console.error(e);
    process.exit(errors.length ? 1 : 0);
  } else if (cmd === "extract") {
    process.stdout.write(JSON.stringify(extract(body), null, 2) + "\n");
  } else {
    console.error("usage: pr-body.cjs check [--public] [file] | extract [file]");
    process.exit(2);
  }
}
