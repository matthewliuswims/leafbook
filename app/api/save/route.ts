import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getNoteFile, isNoteSlug, parseNote } from "@/lib/content";

function failure(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  let payload: { slug?: unknown; body?: unknown; archive?: unknown } | null;
  try {
    payload = await request.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  if (
    typeof payload?.slug !== "string" ||
    typeof payload.body !== "string" ||
    (payload.archive !== undefined && typeof payload.archive !== "boolean")
  ) {
    return failure(
      "Expected { slug: string, body: string, archive?: boolean }",
      400,
    );
  }
  const { slug, body, archive = false } = payload;
  if (!isNoteSlug(slug)) return failure("Invalid slug", 400);

  try {
    const target = getNoteFile(slug, archive);
    if (!target) return failure("Note file not found", 404);
    fs.accessSync(target, fs.constants.W_OK);
    const raw = fs.readFileSync(target, "utf8");
    const existing = parseNote(raw);
    const frontmatter = raw.slice(0, raw.length - existing.content.length);
    const separator = frontmatter && !frontmatter.endsWith("\n") ? "\n" : "";
    const updated = `${frontmatter}${separator}${body}${body.endsWith("\n") ? "" : "\n"}`;

    // Rename on the same filesystem so readers always see a complete file.
    const temporary = path.join(
      path.dirname(target),
      `.leafbook-save-${randomUUID()}`,
    );
    try {
      fs.writeFileSync(temporary, updated, {
        flag: "wx",
        mode: fs.statSync(target).mode & 0o777,
      });
      fs.renameSync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Save error:", error);
    return failure("Could not save the note", 500);
  }
}
