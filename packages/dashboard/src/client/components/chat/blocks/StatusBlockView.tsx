import type { StatusBlock } from '../../../types/chat';

export function StatusBlockView({ block }: { block: StatusBlock }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
      <span className="font-mono text-[10px] tracking-widest text-neutral-muted">{block.text}</span>
    </div>
  );
}
