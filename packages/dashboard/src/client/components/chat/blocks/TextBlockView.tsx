import React from 'react';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import type { TextBlock } from '../../../types/chat';
import { isLogOutput } from '../block-segments';
import { LogOutputView } from './LogOutputView';

export function TextBlockView({ block }: { block: TextBlock }) {
  if (isLogOutput(block.text)) {
    return <LogOutputView text={block.text} />;
  }

  const packedMatches = [...block.text.matchAll(/<?!--\s*packed:\s*(.*?)\s*-->?/g)];
  const cleanText = block.text
    .replace(/<?!--\s*packed:\s*(.*?)\s*-->?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (
    <div className="flex flex-col gap-2 relative">
      {packedMatches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {packedMatches.map((m, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary-500/10 px-2.5 py-0.5 text-[10px] font-medium text-secondary-300 border border-secondary-500/20"
              title="Graph context packing applied"
            >
              <svg
                className="w-3 h-3 text-secondary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              <span>Packed: {m[1]}</span>
            </span>
          ))}
        </div>
      )}
      {cleanText.length > 0 && (
        <div className="prose prose-invert prose-sm max-w-none py-1 selection:bg-primary-500/30">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const {
                  node: _node,
                  className,
                  children,
                  ...rest
                } = props as React.HTMLAttributes<HTMLElement> & { node?: unknown };
                const inline = !(className && /language-(\w+)/.test(className));
                const match = /language-(\w+)/.exec(className ?? '');
                return !inline && match ? (
                  <div className="relative group my-4">
                    <div className="absolute -inset-2 bg-gradient-to-r from-primary-500/10 to-secondary-400/10 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative rounded-lg border border-neutral-border overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-2 bg-neutral-surface/80 border-b border-neutral-border">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
                          {match[1]}
                        </span>
                        <div className="flex gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                        </div>
                      </div>
                      <SyntaxHighlighter
                        {...rest}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="!bg-neutral-surface/40 !m-0 !p-4 !text-[11px] font-mono leading-relaxed"
                      >
                        {(Array.isArray(children)
                          ? children.join('')
                          : typeof children === 'string'
                            ? children
                            : ''
                        ).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                ) : (
                  <code
                    className={`${className} bg-neutral-surface/60 px-1.5 py-0.5 rounded text-secondary-400 font-mono text-[11px] border border-neutral-border`}
                    {...rest}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {cleanText}
          </Markdown>
        </div>
      )}
    </div>
  );
}
