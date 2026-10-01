import { Emitter, type Event, type IDisposable } from "@zcode/rpc";
import type { NotificationEvent } from "@zcode/shared";

const emitter = new Emitter<NotificationEvent>();

export const notificationEvents: Event<NotificationEvent> = emitter.event;

export function publishNotificationEvent(event: NotificationEvent): void {
  emitter.fire(event);
}

export function onNotificationEvent(listener: (event: NotificationEvent) => void): IDisposable {
  return notificationEvents(listener);
}
