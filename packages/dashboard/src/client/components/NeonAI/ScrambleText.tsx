import { useEffect, useState } from 'react';

const CHARS = '!<>-_\\/[]{}—=+*^?#_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [displayText, setDisplay] = useState('');

  useEffect(() => {
    let frame = 0;
    const length = text.length;
    let animationFrameId: number;

    const update = () => {
      let result = '';
      for (let i = 0; i < length; i++) {
        if (i < frame) {
          result += text[i];
        } else {
          result += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      setDisplay(result);

      if (frame < length) {
        frame += 1 / 3; // Slower reveal for dramatic effect
        animationFrameId = requestAnimationFrame(update);
      }
    };
    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [text]);

  return <span className={className}>{displayText}</span>;
}
