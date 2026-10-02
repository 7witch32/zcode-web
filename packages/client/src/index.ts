export { RemoteServiceAccess } from "./remoteServiceAccess.js";
export { connectViaProtocol, connectViaSocket, connectViaWebSocket } from "./websocket.js";
export type { WebSocketConnectionCloseEvent } from "./websocket.js";
export { connectViaMessagePort, createMessagePortServiceConnection } from "./messageport.js";
export type { MessagePortServiceConnection } from "./messageport.js";
export { ConnectionDeathDetector, startConnectionHeartbeat } from "./connectionHeartbeat.js";
export type { ConnectionHeartbeatOptions } from "./connectionHeartbeat.js";
