import type { IPlatformService, UpdateStatePayload } from "@zcode/shared";
import {
  MessageCirclePlus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { UpdateStatusButton } from "@/UpdateStatusButton.js";
import { DesktopTopOverlayActionButton } from "@/DesktopTopOverlayActionButton.js";

interface DesktopTopOverlayProps {
  workspaceAbsPath: string;
  isMacDesktop?: boolean;
  isMacFullscreen?: boolean;
  isWindowsDesktop?: boolean;
  isDesktop?: boolean;
  macWindowControlsLeftPaddingPx?: number;
  windowsWindowControlsRightPaddingPx?: number;
  isSidebarVisible: boolean;
  updateReadyVersion: string | null;
  updateState: UpdateStatePayload | null;
  toggleSidebarShortcutLabel: string;
  newTaskShortcutLabel: string;
  goBackShortcutLabel: string;
  goForwardShortcutLabel: string;
  canTaskNavBack: boolean;
  canTaskNavForward: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  showNewTaskButton?: boolean;
  appLogoUrl: string;
  platform: IPlatformService;
  onToggleSidebar: () => void;
  onCreateTask: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  hideTaskNavigationButtons?: boolean;
  newTaskDisabledReason?: string;
}

export function DesktopTopOverlay(props: DesktopTopOverlayProps) {
  const { intl } = useZCodeIntl();
  const SidebarToggleIcon = props.isSidebarVisible
    ? PanelLeftClose
    : PanelLeftOpen;
  const isNewTaskButtonVisible =
    props.showNewTaskButton ?? !props.isSidebarVisible;
  const toggleSidebarTitle = intl.formatMessage({
    id: "workspaceSidebar.toggleSidebar",
  });
  const newTaskTitle = intl.formatMessage({ id: "sidebar.newTask" });

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20 flex h-14 w-fit max-md:left-3 max-md:z-40">
      <div className="pointer-events-auto flex items-center gap-1 shrink-0 [app-region:no-drag]">
        <DesktopTopOverlayActionButton
          title={toggleSidebarTitle}
          shortcut={props.toggleSidebarShortcutLabel}
          ariaLabel={toggleSidebarTitle}
          onClick={props.onToggleSidebar}
        >
          <SidebarToggleIcon className="size-4" />
        </DesktopTopOverlayActionButton>

        <DesktopTopOverlayActionButton
          title={newTaskTitle}
          shortcut={props.newTaskShortcutLabel}
          ariaLabel={newTaskTitle}
          disabled={Boolean(props.newTaskDisabledReason)}
          onClick={props.onCreateTask}
          buttonClassName={
            isNewTaskButtonVisible
              ? "inline-flex"
              : "pointer-events-none hidden"
          }
        >
          <MessageCirclePlus className="size-4" />
        </DesktopTopOverlayActionButton>

        <UpdateStatusButton
          platform={props.platform}
          version={props.updateReadyVersion}
          updateState={props.updateState}
          isMacDesktop={props.isMacDesktop}
          isWindowsDesktop={props.isWindowsDesktop}
        />
      </div>
    </div>
  );
}
