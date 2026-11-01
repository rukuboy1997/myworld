/**
 * Merge a realtime message into one conversation's local preview history.
 * Keeps message ordering stable and leaves the original state untouched when
 * the Firebase snapshot does not contain any new information.
 */
export function upsertConversationPreview(conversations, otherAddress, incomingMessage) {
  if (!Array.isArray(conversations) || !otherAddress || !incomingMessage?.id) {
    return conversations;
  }

  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.address === otherAddress,
  );
  if (conversationIndex === -1) {
    return [
      ...conversations,
      {
        address: otherAddress,
        messages: [incomingMessage],
      },
    ];
  }

  const conversation = conversations[conversationIndex];
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const messageIndex = messages.findIndex((message) => message.id === incomingMessage.id);
  const previousMessage = messageIndex === -1 ? null : messages[messageIndex];
  const mergedMessage = {
    ...(previousMessage || {}),
    ...incomingMessage,
    id: incomingMessage.id,
  };

  if (
    previousMessage &&
    Object.keys(mergedMessage).every((key) => Object.is(previousMessage[key], mergedMessage[key])) &&
    Object.keys(previousMessage).every((key) => Object.is(previousMessage[key], mergedMessage[key]))
  ) {
    return conversations;
  }

  const nextMessages = messages.slice();
  if (messageIndex === -1) nextMessages.push(mergedMessage);
  else nextMessages[messageIndex] = mergedMessage;

  nextMessages.sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "") ||
    String(a.id).localeCompare(String(b.id)),
  );

  const next = conversations.slice();
  next[conversationIndex] = {
    ...conversation,
    messages: nextMessages,
  };
  return next;
}
