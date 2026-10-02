import { Emitter, VSBuffer, type ISocket } from "@zcode/rpc";

/**
 * Minimal in-memory ISocket for tests: nothing is ever delivered anywhere, and
 * `fireClose()` simulates the transport dying (same emitters the browser wrapper
 * fires on WebSocket close/error).
 */
export function createFakeSocket(): ISocket & { fireClose: () => void } {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write: () => {},
    end: () => {},
    drain: () => Promise.resolve(),
    dispose: () => {},
    fireClose: () => {
      onClose.fire();
      onEnd.fire();
    },
  };
}
