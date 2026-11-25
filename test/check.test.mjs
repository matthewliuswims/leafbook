import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mask, runCheck } from "../lib/check.mjs";

// Sample values are assembled at runtime so this file passes its own check.
const at = "@";
const samples = {
  email: `jane.doe${at}acme-health.com`,
  phone: ["410", "555", "2368"].join("-"),
  ssn: ["123", "45", "6789"].join("-"),
  address: `42 Maple ${"Street"}`,
  npi: `NPI ${"1234567890"}`,
  secret: `AKIA${"ABCDEFGHIJKLMNOP"}`,
  home: `/Users/${"jdoe"}/notes`,
  image: `data:image/png;${"base64"},iVBOR`,
};

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), "leafbook-check-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), body);
  }
  return root;
}

function rules(result) {
  return result.findings.map((f) => f.rule).sort();
}

test("flags each kind of personal info and secret", () => {
  const root = fixture({
    "notes.md": Object.values(samples).join("\n"),
  });
  try {
    const result = runCheck({ root, target: root, checkConfig: undefined });
    assert.deepEqual(rules(result), [
      "email",
      "embedded-image",
      "home-path",
      "id-number",
      "phone",
      "secret",
      "ssn",
      "street-address",
    ]);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("allows placeholders and marked lines", () => {
  const root = fixture({
    "ok.md": [
      `hello${at}example.com`,
      `git${at}github.com:owner/repo.git`,
      ["410", "555", "0123"].join("-"),
      "/Users/you/notes",
      `${samples.email} leafbook-check-allow`,
      "version 1.2.3 on port 3000",
    ].join("\n"),
  });
  try {
    const result = runCheck({ root, target: root, checkConfig: undefined });
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("blocks private words, including names pulled from notes", () => {
  const root = fixture({
    "content/emails/one.md":
      "---\nto: Priya Ramanathan\nsubject: Hi: there\n---\nBody\n",
    "content/emails/two.md": "---\nto: [Lee Okafor]\n---\nBody\n",
    "engine/app.ts": [
      "// Built for Acme",
      "const owner = 'Ramanathan';",
      "const greeting = 'Lee Okafor';",
      "const gray = 'gray';",
    ].join("\n"),
  });
  try {
    const result = runCheck({
      root,
      target: path.join(root, "engine"),
      checkConfig: {
        words: ["Acme"],
        wordsFrom: [{ dir: "content/emails", frontmatter: "to" }],
      },
    });
    assert.equal(result.findings.length, 3);
    assert.ok(result.findings.every((f) => f.rule === "private-word"));
    assert.deepEqual(
      result.findings.map((f) => f.line),
      [1, 2, 3],
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("allowWords removes a false positive", () => {
  const root = fixture({
    "content/emails/one.md": "---\nto: Sam Gray\n---\n",
    "engine/app.ts": "import matter from 'gray-matter';\n",
  });
  try {
    const checkConfig = {
      wordsFrom: [{ dir: "content/emails", frontmatter: "to" }],
    };
    const target = path.join(root, "engine");
    assert.equal(runCheck({ root, target, checkConfig }).findings.length, 1);
    checkConfig.allowWords = ["gray"];
    assert.equal(runCheck({ root, target, checkConfig }).findings.length, 0);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("blocks binary files unless approved", () => {
  const root = fixture({
    "public/shot.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]),
    "public/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 2]),
  });
  try {
    const result = runCheck({
      root,
      target: root,
      checkConfig: { allowFiles: ["public/logo.png"] },
    });
    assert.deepEqual(
      result.findings.map((f) => [f.file, f.rule]),
      [["public/shot.png", "binary-file"]],
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("mask never shows a full match", () => {
  assert.equal(mask("Ramanathan"), "Ra********");
  assert.equal(mask("Lee"), "***");
});
