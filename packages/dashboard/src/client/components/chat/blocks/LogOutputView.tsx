import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function LogOutputView({ text }: { text: string }) {
  return (
    <div className="my-2 rounded border border-neutral-border/30 bg-neutral-surface/20 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-border/10 bg-neutral-surface/40 select-none">
        <div className="flex gap-1 mr-1">
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-border/30" />
        </div>
        <span className="text-[10px] font-black tracking-[0.2em] text-neutral-muted/60 uppercase">
          Terminal Output
        </span>
      </div>
      <div className="px-3 py-3 bg-neutral-bg/20">
        <div className="prose prose-invert prose-xs selection:bg-secondary-400/20 whitespace-pre-wrap">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      </div>
    </div>
  );
}
