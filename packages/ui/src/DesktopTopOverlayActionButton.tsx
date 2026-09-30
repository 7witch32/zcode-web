import { useRef } from "react";
import type { ComponentProps, ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";

interface DesktopTopOverlayActionButtonProps {
  title: string;
  ariaLabel: string;
  children: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  onPointerUp?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMouseEnter?: () => void;
  side?: ComponentProps<typeof ControlHintTooltip>["side"];
  buttonClassName?: string;
  testId?: string;
}

export function DesktopTopOverlayActionButton({
  title,
  ariaLabel,
  children,
  shortcut,
  disabled,
  onClick,
  onPointerUp,
  onMouseEnter,
  side = "bottom",
  buttonClassName,
  testId,
}: DesktopTopOverlayActionButtonProps) {
  const suppressNextClickRef = useRef(false);

  return (
    <ControlHintTooltip title={title} shortcut={shortcut} side={side}>
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        // 基础 Button 默认 transition-all，缩放窗口时会把标题栏按钮的尺寸/位置变化也动画化，
        // Windows 连续缩放下会像按钮先复位再跟随；这里的浮层按钮只需要 hover 色彩过渡。
        className={cn("[app-region:no-drag] transition-colors", buttonClassName)}
        data-testid={testId}
        aria-label={ariaLabel}
        disabled={disabled}
        // 顶部浮层的新建任务入口会复用带可选 provider 参数的业务函数。
        // ถ้า direct DOM event หลุดเข้า business callback จะถูกตีความเป็น provider และทำให้ IPC log clone พัง
        // จึงเรียกเฉพาะ action แบบไม่มีอาร์กิวเมนต์
        onPointerUp={onPointerUp}
        onTouchEnd={(event: ReactTouchEvent<HTMLButtonElement>) => {
          if (!disabled) {
            suppressNextClickRef.current = true;
            onClick();
            event.preventDefault();
          }
        }}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          onClick();
        }}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </Button>
    </ControlHintTooltip>
  );
}
