import { create } from "zustand";
import { logger } from "@/logger.js";

export interface ConfirmDialogRequest {
  title: string;
  testId?: string;
  description?: string;
  /** 特定业务弹框的稳定视觉规范；默认确认框不受影响。 */
  presentation?: "automation-confirmation";
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  showCloseButton?: boolean;
  showKeyboardHints?: boolean;
  compact?: boolean;
  checkbox?: { label: string; onCheckedChange: (checked: boolean) => void };
}

type ConfirmDialogChoice = "confirm" | "cancel" | "dismiss";

interface PendingConfirmDialogRequest extends ConfirmDialogRequest {
  resolve: (choice: ConfirmDialogChoice) => void;
}

interface ConfirmDialogState {
  pendingRequest?: PendingConfirmDialogRequest;
  /** 已接受但还没轮到展示的请求；settle 后按序晋升，保证没有任何请求被静默丢弃。 */
  queuedRequests: PendingConfirmDialogRequest[];
  requestConfirmation: (payload: ConfirmDialogRequest) => Promise<boolean>;
  requestChoice: (payload: ConfirmDialogRequest) => Promise<ConfirmDialogChoice>;
  settleConfirmation: (confirmed: boolean) => void;
  settleChoice: (choice: ConfirmDialogChoice) => void;
  /**
   * Host 卸载时调用：此后没有任何组件能渲染并结算这些弹窗，
   * 全部按 dismiss 收尾，调用侧的 await 不得永久悬挂。
   */
  dismissAllPending: () => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  pendingRequest: undefined,
  queuedRequests: [],
  requestConfirmation: async (payload) => (await get().requestChoice(payload)) === "confirm",
  requestChoice: (payload) => {
    const queued: PendingConfirmDialogRequest = { ...payload, resolve: () => {} };
    return new Promise<ConfirmDialogChoice>((resolve) => {
      queued.resolve = resolve;
      if (get().pendingRequest) {
        // 旧实现在已有弹窗时直接 resolve("dismiss")：后来者的操作（保存/删除/选模型）
        // 会被静默取消，调用侧与用户都毫无感知。改为排队，等当前弹窗结算后依次展示。
        logger.warn("[ConfirmDialogStore] another confirmation is open; queuing the request", {
          title: payload.title,
        });
        set((state) => ({ queuedRequests: [...state.queuedRequests, queued] }));
        return;
      }
      set({ pendingRequest: queued });
    });
  },
  settleConfirmation: (confirmed) => get().settleChoice(confirmed ? "confirm" : "cancel"),
  settleChoice: (choice) => {
    const pendingRequest = get().pendingRequest;
    if (!pendingRequest) {
      return;
    }

    const [next, ...rest] = get().queuedRequests;
    // 结算后立即晋升队列头，Host 的 open 状态保持 true，直接切换到下一个弹窗内容。
    set({ pendingRequest: next, queuedRequests: rest });
    pendingRequest.resolve(choice);
  },
  dismissAllPending: () => {
    const { pendingRequest, queuedRequests } = get();
    set({ pendingRequest: undefined, queuedRequests: [] });
    pendingRequest?.resolve("dismiss");
    for (const queued of queuedRequests) {
      queued.resolve("dismiss");
    }
  },
}));
