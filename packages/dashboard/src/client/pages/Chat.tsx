import { ChatPanel } from '../components/chat/ChatPanel';

export function Chat() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-neutral-bg">
      <ChatPanel isOpen={true} maximized={true} />
    </div>
  );
}
