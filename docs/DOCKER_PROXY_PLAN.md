# ZCode Docker — Docker API Proxy Plan

## 1. Objective
Add a restricted Docker API Proxy so the ZCode backend container can operate Docker on the Windows host's Docker Desktop daemon without exposing the Docker API to LAN/Tailscale clients.

Primary goals:
- ZCode can create/run/inspect required project containers.
- Existing ZCode WebUI remote access remains unchanged.
- Tailscale remains on the Windows host.
- Docker API is reachable only from the intended internal Docker network.
- Avoid unrestricted Docker socket/daemon exposure where possible.

## 2. Current deployment baseline
Project: D:\Drive\MY\viteWorkspace\zcode-docker
Current service: zcode
Current WebUI port: 3030
Current workspace mount: ./workspace:/workspace
Current persistent volume: zcode-data:/data

Do not change the existing ZCode port or Tailscale access path as part of this work.

## 3. Target architecture
Browser/iPhone/iPad
  |
  | Tailscale -> Windows host
  v
ZCode WebUI :3030
  |
  | internal Docker network only
  v
Docker API Proxy
  |
  | Docker Desktop host daemon
  v
Docker Engine
  |
  +-- project/test containers

The proxy must NOT publish a host port such as 2375.

## 4. Windows + Docker Desktop constraint
**Verified 2026-09-30:** Windows host runs Docker Desktop 4.91.0 / Engine 29.8.0 with desktop-linux. A Linux container can bind /var/run/docker.sock and reach the Docker Desktop daemon; /_ping returned 200 OK.

Selected path:
1. Mount /var/run/docker.sock only into the proxy, read-only.
2. Put proxy and ZCode on a dedicated Docker network.
3. Point ZCode's standard Docker client at tcp://docker-api-proxy:2375.
4. Do not publish the proxy port to the Windows host.

No host-side TCP bridge is required.

## 5. Proxy implementation
Preferred proxy: a maintained Docker socket/API proxy such as tecnativa/docker-socket-proxy, only if it can be used correctly with the Windows Docker Desktop daemon in this deployment.

The proxy configuration must use least privilege. Enable only the Docker API groups required by ZCode's actual workflow.

Initial capability categories to investigate:
- CONTAINERS: read/create/start/stop/inspect/exec/logs as required.
- IMAGES: inspect/pull/build as required.
- NETWORKS: read/create/connect as required.
- VOLUMES: read/create as required.
- SYSTEM: only if proven necessary.

Do not enable privileged host-level operations merely for convenience.

## 6. Network isolation
Create a dedicated internal Docker network for ZCode and the proxy.

Example concept:
  zcode -> docker-api-proxy

The proxy should have no published host port.

The ZCode service should use the proxy by an internal service hostname, not a Tailscale IP and not the host's LAN address.

## 7. Docker API endpoint inside ZCode
Implemented with the standard Docker client environment variable:
  DOCKER_HOST=tcp://docker-api-proxy:2375

Source inspection found no ZCode-specific Docker API environment variable for the backend agent. The standard DOCKER_HOST mechanism is therefore used; no ZCode-specific variable was invented.

The runtime image now includes the Docker CLI plus buildx and compose plugins from docker:29.8.0-cli.

## 8. Security requirements
Never:
- Publish Docker API port 2375/2376 to 0.0.0.0.
- Bind the unrestricted Docker daemon to TCP solely for convenience.
- Expose the Docker API through Tailscale.
- Give the proxy unrestricted privileged/host filesystem capabilities without testing the narrower alternative.
- Store Docker credentials/secrets in Git.

Remember: Docker daemon control is effectively host-level control. Treat the proxy as a privileged security boundary.

## 9. Implementation sequence
1. Inspect current docker-compose.yml and Dockerfile.
2. Inspect ZCode source for Docker integration and supported Docker environment variables.
3. Determine how Docker Desktop's daemon is reachable from containers on this Windows host.
4. Test the least-privilege proxy independently.
5. Add proxy service and dedicated internal network to compose.
6. Configure only required API permissions.
7. Configure ZCode to use the proxy.
8. Rebuild/recreate only what is necessary.
9. Verify existing WebUI and remote access still work.
10. Verify ZCode can perform the required Docker operations.
11. Verify the proxy cannot be reached from the host's LAN/Tailscale interface.
12. Record exact configuration and rollback procedure.

## 10. Required tests
### A. Existing ZCode regression
- [x] WebUI returns HTTP 200 on localhost:3030 after proxy deployment.
- [ ] Existing Tailscale remote access still works — external-device verification pending.
- [x] zcode-web is healthy after recreation.
- [x] Existing zcode-data:/data volume remains mounted; it was not deleted.
- [x] Workspace ./workspace:/workspace remains mounted.
- [ ] Login/session state should be confirmed from the existing WebUI on the next remote login.

### B. Proxy connectivity
- [x] docker-api-proxy resolves from zcode-web.
- [x] ZCode connects through DOCKER_HOST=tcp://docker-api-proxy:2375.
- [x] Docker server version query succeeds.
- [x] Proxy has no host port mapping; docker port zcode-docker-api-proxy returned no mapping.

### C. Allowed operations
- [x] image inspect
- [x] image pull
- [x] image build
- [x] container create/start/run
- [x] container logs
- [x] container exec
- [x] container stop/remove
- [x] network list
- [x] volume list

### D. Denied operations
- [x] docker info is rejected (INFO=0).
- [x] docker system df is rejected (SYSTEM=0).

### E. Isolation
- [x] ZCode :3030 remains published exactly as before.
- [x] Docker API proxy has no host/LAN/Tailscale port mapping.
- [x] This deployment does not configure a new Docker daemon TCP listener.
- [ ] External-device Tailscale test remains pending.

## 11. Rollback
Rollback must be simple:
1. Stop/remove proxy service.
2. Restore the previous docker-compose.yml.
3. Recreate ZCode container.
4. Verify port 3030 and Tailscale access.
5. Do not delete zcode-data unless explicitly required.

Do not modify the existing ZCode data volume during proxy experimentation.

## 12. Acceptance criteria
- [x] Docker Desktop daemon access method verified on Windows.
- [x] Proxy runs successfully.
- [x] Proxy is on a dedicated internal Docker network.
- [x] No Docker API host port is published.
- [x] ZCode can reach proxy.
- [x] Tested required Docker operations work.
- [x] INFO and SYSTEM API categories are denied.
- [x] Existing WebUI :3030 still works.
- [ ] Tailscale remote access still works — external-device verification pending.
- [x] Docker API is not exposed through a host port.
- [x] Existing /data and /workspace mounts are unchanged.
- [x] Configuration and rollback are documented.

## 13. Important implementation rule
Do not start by changing the running ZCode deployment blindly. First inspect the current Docker integration and Docker Desktop connectivity, then make the smallest reversible change.

The final implementation must preserve the existing ZCode/Tailscale architecture and add Docker control as an internal capability only.
