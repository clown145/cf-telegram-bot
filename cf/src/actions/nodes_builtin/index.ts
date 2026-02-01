import type { ModularActionDefinition } from "../modularActions";
import type { ActionHandler } from "../handlers";

import branch from "./branch";
import loopCounter from "./loop_counter";
import forEach from "./for_each";
import switchNode from "./switch";
import tryCatch from "./try_catch";
import subWorkflow from "./sub_workflow";
import provideStaticString from "./provide_static_string";
import concatStrings from "./concat_strings";
import providePlaceholders from "./provide_placeholders";
import delay from "./delay";
import showNotification from "./show_notification";
import updateMessage from "./update_message";
import sendMessage from "./send_message";
import sendDocument from "./send_document";
import sendVideo from "./send_video";
import sendMediaGroup from "./send_media_group";
import editMessageText from "./edit_message_text";
import editMessageMedia from "./edit_message_media";
import deleteMessage from "./delete_message";
import cacheFromUrl from "./cache_from_url";
import awaitUserInput from "./await_user_input";
import provideExistingIds from "./provide_existing_ids";
import redirectTriggerButton from "./redirect_trigger_button";

export interface NodePackage {
  definition: ModularActionDefinition;
  handler: ActionHandler;
}

export const BUILTIN_NODE_PACKAGES: NodePackage[] = [
  branch,
  loopCounter,
  forEach,
  switchNode,
  tryCatch,
  subWorkflow,
  provideStaticString,
  concatStrings,
  providePlaceholders,
  delay,
  showNotification,
  updateMessage,
  sendMessage,
  sendDocument,
  sendVideo,
  sendMediaGroup,
  editMessageText,
  editMessageMedia,
  deleteMessage,
  cacheFromUrl,
  awaitUserInput,
  provideExistingIds,
  redirectTriggerButton,
];

export const BUILTIN_NODE_DEFINITIONS: ModularActionDefinition[] = BUILTIN_NODE_PACKAGES.map(
  (pkg) => pkg.definition
);

export const BUILTIN_NODE_HANDLERS: Record<string, ActionHandler> = Object.fromEntries(
  BUILTIN_NODE_PACKAGES.map((pkg) => [pkg.definition.id, pkg.handler])
);
