// `leafbook check`: block personal info, secrets, private words, and
// unapproved binary files before a folder is committed or published.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ALLOW_MARKER = "leafbook-check-allow";
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".leafbook"]);
const SAFE_EMAIL_DOMAIN =
  /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost|users\.noreply\.github\.com)$/i;

// Each rule returns the matched strings in one line of text.
const RULES = [
  {
    id: "email",
    find: (line) =>
      [...line.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g)]
        .map((m) => m[0])
        .filter((email) => {
          const [local, domain] = email.split("@");
          return !SAFE_EMAIL_DOMAIN.test(domain) && local !== "git";
        }),
  },
  {
    id: "phone",
    find: (line) =>
      [
        ...line.matchAll(
          /(?<![\w.-])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.-])/g,
        ),
      ]
        .map((m) => m[0])
        // 555-01xx numbers are reserved for fiction.
        .filter((phone) => !/555[\s.-]01\d\d$/.test(phone)),
  },
  {
    id: "ssn",
    find: (line) =>
      [...line.matchAll(/(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g)].map(
        (m) => m[0],
      ),
  },
  {
    id: "street-address",
    find: (line) =>
      [
        ...line.matchAll(
          /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Parkway|Pkwy)\b\.?/g,
        ),
      ].map((m) => m[0]),
  },
  {
    id: "id-number",
    find: (line) =>
      [
        ...line.matchAll(
          /\b(?:NPI|MRN|DOB|date of birth|member id|policy (?:number|no\.?)|account (?:number|no\.?))\b\W{0,3}[\w/-]*\d{4,}/gi,
        ),
      ].map((m) => m[0]),
  },
  {
    id: "secret",
    find: (line) =>
      [
        ...line.matchAll(
          /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
        ),
      ].map((m) => m[0]),
  },
  {
    id: "home-path",
    find: (line) =>
      [...line.matchAll(/(?:\/Users|\/home)\/([A-Za-z0-9._-]+)/g)]
        .filter(
          (m) =>
            !["you", "me", "user", "username", "runner", "OWNER"].includes(
              m[1],
            ),
        )
        .map((m) => m[0]),
  },
  {
    id: "embedded-image",
    find: (line) =>
      [...line.matchAll(/data:(?:image|application)\/[\w.+-]+;base64,/g)].map(
        (m) => m[0],
      ),
  },
];

function toList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${field} must be a list of strings`);
  }
  return value;
}

function readCheckConfig(data) {
  const check = data ?? {};
  if (typeof check !== "object" || Array.isArray(check)) {
    throw new Error("check must be a JSON object");
  }
  const wordsFrom = check.wordsFrom ?? [];
  if (
    !Array.isArray(wordsFrom) ||
    wordsFrom.some(
      (s) =>
        !s || typeof s.dir !== "string" || typeof s.frontmatter !== "string",
    )
  ) {
    throw new Error(
      'check.wordsFrom must be a list of { "dir": "...", "frontmatter": "..." }',
    );
  }
  return {
    words: toList(check.words, "check.words"),
    wordsFrom,
    allowWords: toList(check.allowWords, "check.allowWords").map((w) =>
      w.toLowerCase(),
    ),
    allowFiles: toList(check.allowFiles, "check.allowFiles"),
    ignore: toList(check.ignore, "check.ignore"),
  };
}

// Private words: listed ones, plus names pulled from frontmatter fields in the
// notes (for example the `to:` field of saved emails). Multi-word names also
// add each word of three or more letters.
export function collectWords(root, check) {
  const words = new Set(check.words.map((w) => w.trim()).filter(Boolean));
  for (const { dir, frontmatter } of check.wordsFrom) {
    const directory = path.resolve(root, dir);
    if (!existsSync(directory)) {
      throw new Error(`check.wordsFrom folder not found: ${dir}`);
    }
    for (const file of walk(directory)) {
      if (!/\.mdx?$/.test(file)) continue;
      const value = readFrontmatterField(
        readFileSync(file, "utf8"),
        frontmatter,
      );
      for (const name of [value].flat()) {
        if (typeof name !== "string" || !name.trim()) continue;
        words.add(name.trim());
        for (const part of name.trim().split(/\s+/)) {
          if (part.length >= 3) words.add(part);
        }
      }
    }
  }
  return [...words].filter(
    (word) => !check.allowWords.includes(word.toLowerCase()),
  );
}

// Hand-written frontmatter is often not strict YAML (for example an unquoted
// colon in a subject line). Fall back to reading the one `field:` line.
function readFrontmatterField(text, field) {
  try {
    return matter(text).data[field];
  } catch {
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    const line = new RegExp(`^${escapeRegExp(field)}:\\s*(.+)$`, "m").exec(
      block,
    );
    return line?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

// In a Git checkout, scan what Git would commit: tracked files plus new files
// that are not ignored. Elsewhere, scan every file.
function listFiles(target) {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "."],
      { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\0")
      .filter(Boolean)
      .map((file) => path.join(target, file))
      .filter((file) => existsSync(file) && statSync(file).isFile());
  } catch {
    return walk(target);
  }
}

function matchesPath(relative, patterns) {
  return patterns.some((p) => {
    const pattern = p.replace(/^\.\//, "");
    return pattern.endsWith("/")
      ? relative.startsWith(pattern)
      : relative === pattern;
  });
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Never print a full match: CI logs are often public.
export function mask(text) {
  const visible = Math.min(2, Math.floor(text.length / 4));
  return `${text.slice(0, visible)}${"*".repeat(Math.max(3, text.length - visible))}`;
}

export function runCheck({ root, target, checkConfig }) {
  const check = readCheckConfig(checkConfig);
  const words = collectWords(root, check);
  const wordPattern = words.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${[...words]
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join("|")})(?![\\p{L}\\p{N}])`,
        "giu",
      )
    : null;
  const findings = [];
  const files = listFiles(target);

  for (const file of files) {
    const relative = path.relative(target, file).split(path.sep).join("/");
    if (matchesPath(relative, check.ignore)) continue;
    const allowed = matchesPath(relative, check.allowFiles);
    const buffer = readFileSync(file);
    if (isBinary(buffer)) {
      if (!allowed) {
        findings.push({
          file: relative,
          line: 0,
          rule: "binary-file",
          match: "",
        });
      }
      continue;
    }
    if (allowed) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const rule of RULES) {
        for (const match of rule.find(line)) {
          findings.push({
            file: relative,
            line: index + 1,
            rule: rule.id,
            match,
          });
        }
      }
      if (wordPattern) {
        for (const m of line.matchAll(wordPattern)) {
          findings.push({
            file: relative,
            line: index + 1,
            rule: "private-word",
            match: m[0],
          });
        }
      }
    });
  }
  return { findings, filesScanned: files.length, wordCount: words.length };
}

export function check(config, args) {
  const target = path.resolve(args[0] ?? ".");
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`check target is not a folder: ${args[0]}`);
  }
  const { findings, filesScanned, wordCount } = runCheck({
    root: config.root,
    target,
    checkConfig: config.check,
  });
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    const detail =
      f.rule === "binary-file"
        ? "binary file not in check.allowFiles"
        : mask(f.match);
    console.log(`${where}  ${f.rule}  ${detail}`);
  }
  const summary = `${filesScanned} files, ${wordCount} private words`;
  if (findings.length) {
    console.log(
      `\nleafbook check: ${findings.length} finding(s) in ${summary}. ` +
        `Remove them, or mark a false positive with "${ALLOW_MARKER}" on the line, ` +
        "or list the file in check.allowFiles.",
    );
    process.exitCode = 1;
  } else {
    console.log(`leafbook check: clean (${summary}).`);
  }
}
