"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/react";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

/** tiptap-markdown augments editor.storage but ships no types for it. */
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

/**
 * Rich-text editor (TipTap) that reads and writes Markdown, so `body` fields
 * stay clean Markdown in Git.
 */
export function RichText({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Markdown],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor));
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[160px] rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:border-gray-900",
      },
    },
  });

  // Keep the editor in sync if the value is replaced externally (e.g. reload).
  useEffect(() => {
    if (editor && value !== getMarkdown(editor)) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div>
      {editable && (
        <div className="mb-2 flex gap-1 text-sm">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
            B
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
            <em>i</em>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
            H2
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
            • List
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 ${active ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
    >
      {children}
    </button>
  );
}
