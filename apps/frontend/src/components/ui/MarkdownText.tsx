import type { FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownTextProps = {
  content: string;
  className?: string;
};

export const MarkdownText: FC<MarkdownTextProps> = ({ content, className }) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-black/10 px-1.5 py-0.5 text-[0.92em] dark:bg-white/10">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-lg bg-black/10 p-3 text-xs dark:bg-white/10">{children}</pre>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/30 pl-3 italic dark:border-white/20">{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
