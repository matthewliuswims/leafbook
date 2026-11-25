"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";

// Raw HTML is allowed for <details> sections, then sanitized so a tab can't
// run scripts or inject global styles. Keep ids unprefixed so heading and
// footnote links still work.
const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [...(defaultSchema.tagNames ?? []), "small"],
};

type MarkdownProps = {
  children: string;
  /**
   * When true (opted in via `copyButtons: true` frontmatter), every blockquote
   * renders with a Copy button for templates.
   */
  copyBlockquotes?: boolean;
};

export function Markdown({ children, copyBlockquotes = false }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // rehype-raw lets tabs use <details> for collapsible sections.
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeSlug]}
      components={
        copyBlockquotes
          ? { blockquote: CopyableBlockquote, img: ZoomableImage }
          : { img: ZoomableImage }
      }
    >
      {children}
    </ReactMarkdown>
  );
}

// Click an image (usually a diagram) to see it larger in a modal. Escape, the
// close button, or a click anywhere closes it. It uses a native <dialog> so
// focus stays inside while open and returns to the image after. The dialog is
// portaled to <body> because images render inside <p>, which can't hold it.
function ZoomableImage({
  node: _node,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & ExtraProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-zoom-in border-0 bg-transparent p-0"
        aria-label={`Expand image${props.alt ? `: ${props.alt}` : ""}`}
      >
        <img {...props} alt={props.alt ?? ""} />
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-label={props.alt || "Expanded image"}
            onClick={close}
            onClose={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none cursor-zoom-out items-center justify-center border-0 bg-transparent p-4 backdrop:bg-black/75 open:flex sm:p-10"
          >
            <img
              src={props.src}
              alt={props.alt ?? ""}
              className="max-h-full w-full max-w-[1600px] rounded-lg bg-white object-contain p-4 shadow-2xl sm:p-6"
            />
            <button
              type="button"
              autoFocus
              onClick={close}
              className="absolute right-4 top-4 rounded-md bg-white/90 px-3 py-1 text-sm font-medium text-stone-800 shadow hover:bg-white"
            >
              Close
            </button>
          </dialog>,
          document.body,
        )}
    </>
  );
}

function CopyableBlockquote({
  node: _node,
  ...props
}: React.BlockquoteHTMLAttributes<HTMLQuoteElement> & ExtraProps) {
  const ref = useRef<HTMLQuoteElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    const el = ref.current;
    if (!el) return;
    // Copy the contents as paragraphs. The HTML carries links and line breaks.
    const html = el.innerHTML;
    const text = el.innerText;
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setState("copied");
    } catch (e) {
      console.error("Template copy failed:", e);
      setState("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 1600);
  };

  const label =
    state === "copied"
      ? "Copied!"
      : state === "failed"
        ? "Copy failed"
        : "Copy";

  return (
    <>
      <blockquote {...props} ref={ref} />
      <div className="not-prose -mt-3 mb-7">
        <button
          type="button"
          onClick={handleCopy}
          className={`rounded-md border px-3 py-1 text-xs font-medium shadow-sm transition-colors ${
            state === "copied"
              ? "border-green-200 bg-green-50 text-green-700"
              : state === "failed"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
          }`}
          aria-label="Copy this template to the clipboard"
        >
          {label}
        </button>
      </div>
    </>
  );
}
