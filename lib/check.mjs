// `leafbook check`: block personal info, secrets, private words, and
// unapproved binary files before a folder is committed or published.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
      for (const name of value) {
        if (!name) continue;
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

// Read one frontmatter field without a YAML parser: hand-written frontmatter
// is often not strict YAML, and parsers can run code (gray-matter's `---js`).
// Handles `to: Name`, `to: [A, B]`, and a `- item` list under `to:`.
export function readFrontmatterField(text, field) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!block) return [];
  const lines = block.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (start === -1) return [];
  const unquote = (v) =>
    v
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2")
      .trim();
  const inline = lines[start].slice(field.length + 1).trim();
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(unquote);
  }
  if (inline) return [unquote(inline)];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (!item) break;
    items.push(unquote(item[1]));
  }
  return items;
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

function scanLine(line, file, lineNumber, findings, wordPattern) {
  if (line.includes(ALLOW_MARKER)) return;
  for (const rule of RULES) {
    for (const match of rule.find(line)) {
      findings.push({ file, line: lineNumber, rule: rule.id, match });
    }
  }
  if (wordPattern) {
    for (const m of line.matchAll(wordPattern)) {
      findings.push({
        file,
        line: lineNumber,
        rule: "private-word",
        match: m[0],
      });
    }
  }
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
    scanLine(relative, relative, 0, findings, wordPattern);
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
    lines.forEach((line, index) =>
      scanLine(line, relative, index + 1, findings, wordPattern),
    );
  }
  return { findings, filesScanned: files.length, wordCount: words.length };
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

// Export exactly what will be committed (--staged) or pushed (--rev) to a
// temporary folder, so unstaged edits cannot hide or fake a result. A commit's
// message is scanned too, because it is published with the history.
function exportSnapshot(target, mode, rev) {
  const top = git(["rev-parse", "--show-toplevel"], { cwd: target }).trim();
  const prefix = path.relative(top, target);
  const directory = mkdtempSync(path.join(tmpdir(), "leafbook-check-"));
  const tree = path.join(directory, "tree");
  mkdirSync(tree);
  if (mode === "staged") {
    git(["checkout-index", "--all", `--prefix=${tree}/`], { cwd: top });
  } else {
    const archive = execFileSync("git", ["archive", "--format=tar", rev], {
      cwd: top,
      maxBuffer: 1024 * 1024 * 1024,
    });
    execFileSync("tar", ["-x", "-C", tree], { input: archive });
    writeFileSync(
      path.join(directory, "message.txt"),
      git(["log", "-1", "--format=%B", rev], { cwd: top }),
    );
  }
  return { directory, scan: path.join(tree, prefix) };
}

export function check(config, args) {
  let mode = "files";
  let rev;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--staged") mode = "staged";
    else if (args[i] === "--rev") {
      mode = "rev";
      rev = args[++i];
      if (!rev) throw new Error("--rev needs a commit");
    } else rest.push(args[i]);
  }
  if (rest.length > 1) throw new Error("check takes one folder");
  const target = path.resolve(rest[0] ?? ".");
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`check target is not a folder: ${rest[0]}`);
  }

  const snapshot = mode === "files" ? null : exportSnapshot(target, mode, rev);
  let result;
  try {
    result = runCheck({
      root: config.root,
      target: snapshot ? snapshot.scan : target,
      checkConfig: config.check,
    });
    if (snapshot && existsSync(path.join(snapshot.directory, "message.txt"))) {
      const message = runCheck({
        root: config.root,
        target: snapshot.directory,
        checkConfig: { ...config.check, ignore: ["tree/"] },
      });
      result.findings.push(
        ...message.findings.map((f) => ({ ...f, file: "(commit message)" })),
      );
    }
  } finally {
    if (snapshot) rmSync(snapshot.directory, { recursive: true, force: true });
  }

  const { findings, filesScanned, wordCount } = result;
  const label =
    mode === "rev"
      ? ` at ${rev.slice(0, 12)}`
      : mode === "staged"
        ? " (staged)"
        : "";
  // CI logs can be public, and a file path may itself contain a name, so CI
  // prints only counts per rule. Run locally to see locations.
  if (process.env.CI) {
    const counts = {};
    for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
    for (const [rule, count] of Object.entries(counts)) {
      console.log(`${rule}: ${count}`);
    }
  } else {
    for (const f of findings) {
      const where = f.line ? `${f.file}:${f.line}` : f.file;
      const detail =
        f.rule === "binary-file"
          ? "binary file not in check.allowFiles"
          : mask(f.match);
      console.log(`${where}  ${f.rule}  ${detail}`);
    }
  }
  const summary = `${filesScanned} files, ${wordCount} private words`;
  if (findings.length) {
    console.log(
      `\nleafbook check${label}: ${findings.length} finding(s) in ${summary}. ` +
        `Remove them, or mark a false positive with "${ALLOW_MARKER}" on the line, ` +
        "or list the file in check.allowFiles.",
    );
    process.exitCode = 1;
  } else {
    console.log(`leafbook check${label}: clean (${summary}).`);
  }
}
