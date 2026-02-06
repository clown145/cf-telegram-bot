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
import sendAudio from "./send_audio";
import sendAnimation from "./send_animation";
import sendMediaGroup from "./send_media_group";
import forwardMessage from "./forward_message";
import copyMessage from "./copy_message";
import editMessageText from "./edit_message_text";
import editMessageMedia from "./edit_message_media";
import deleteMessage from "./delete_message";
import cacheFromUrl from "./cache_from_url";
import awaitUserInput from "./await_user_input";
import provideExistingIds from "./provide_existing_ids";
import redirectTriggerButton from "./redirect_trigger_button";
import triggerCommand from "./trigger_command";
import triggerKeyword from "./trigger_keyword";
import triggerButton from "./trigger_button";
import triggerInlineQuery from "./trigger_inline_query";
import triggerChatMember from "./trigger_chat_member";
import triggerMyChatMember from "./trigger_my_chat_member";
import getChatMember from "./get_chat_member";
import getChat from "./get_chat";
import checkMemberRole from "./check_member_role";
import stringOps from "./string_ops";
import setVariable from "./set_variable";
import jsonParse from "./json_parse";

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
  sendAudio,
  sendAnimation,
  sendMediaGroup,
  forwardMessage,
  copyMessage,
  editMessageText,
  editMessageMedia,
  deleteMessage,
  cacheFromUrl,
  awaitUserInput,
  provideExistingIds,
  redirectTriggerButton,
  triggerCommand,
  triggerKeyword,
  triggerButton,
  triggerInlineQuery,
  triggerChatMember,
  triggerMyChatMember,
  getChatMember,
  getChat,
  checkMemberRole,
  stringOps,
  setVariable,
  jsonParse,
];

export const BUILTIN_NODE_DEFINITIONS: ModularActionDefinition[] = BUILTIN_NODE_PACKAGES.map(
  (pkg) => pkg.definition
);

export const BUILTIN_NODE_HANDLERS: Record<string, ActionHandler> = Object.fromEntries(
  BUILTIN_NODE_PACKAGES.map((pkg) => [pkg.definition.id, pkg.handler])
);
