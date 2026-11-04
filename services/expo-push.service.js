// Best-effort Expo push delivery. In-app notification records remain the source
// of truth; push provider failures must never fail the originating social action.
export async function deliverExpoPush(
  { recipient, type, actorAddress, postId, statusId, excerpt } = {},
  {
    query,
    getProfile,
    fetchImpl = globalThis.fetch,
    logger = console,
  } = {},
) {
  try {
    // Reports stay in the in-app notification centre; do not push them to users.
    if (type === "report") return { skipped: true, reason: "report_notification" };
    if (!recipient || typeof query !== "function" || typeof getProfile !== "function") {
      return { skipped: true, reason: "missing_delivery_dependencies" };
    }
    if (typeof fetchImpl !== "function") {
      return { skipped: true, reason: "fetch_unavailable" };
    }

    const { rows = [] } = await query(
      "SELECT token FROM push_tokens WHERE user_address = $1",
      [recipient],
    );
    const tokens = [...new Set(rows.map((row) => row.token).filter(Boolean))];
    if (!tokens.length) return { sent: 0, skipped: true, reason: "no_registered_devices" };

    let actorProfile = null;
    try {
      actorProfile = await getProfile(actorAddress);
    } catch (error) {
      logger.warn("[push] actor profile lookup failed:", error?.message || error);
    }
    const actorName =
      actorProfile?.displayName?.trim() ||
      actorProfile?.username ||
      (actorAddress
        ? String(actorAddress).slice(0, 6) + "…" + String(actorAddress).slice(-4)
        : "Someone");
    const rawAvatarUrl = actorProfile?.avatarUrl;
    const senderAvatarUrl =
      typeof rawAvatarUrl === "string" && /^https:\/\//i.test(rawAvatarUrl)
        ? rawAvatarUrl
        : null;

    const copy = {
      like: { title: "New like on myWorld", body: actorName + " liked your post." },
      status_like: { title: "New like on your Status", body: actorName + " liked your status." },
      comment: {
        title: "New comment on myWorld",
        body: actorName + " commented: " + (excerpt || "Open myWorld to view it."),
      },
      follow: { title: "New follower on myWorld", body: actorName + " started following you." },
      // Keep the Android app name as notification header; show the sender as title.
      message: { title: actorName, body: excerpt || "Sent you a message." },
    }[type] || {
      title: "myWorld notification",
      body: excerpt || "You have a new notification.",
    };

    const path = type === "message"
      ? `/messages?with=${encodeURIComponent(actorAddress || "")}`
      : type === "follow"
        ? `/profile/${encodeURIComponent(actorAddress || "")}`
        : type === "status_like"
          ? "/feed"
          : postId
            ? `/post/${encodeURIComponent(postId)}`
            : "/notifications";

    let sent = 0;
    let failed = 0;
    // Expo accepts up to 100 messages per request.
    for (let offset = 0; offset < tokens.length; offset += 100) {
      const batch = tokens.slice(offset, offset + 100);
      const messages = batch.map((token) => ({
        to: token,
        title: copy.title,
        body: String(copy.body).slice(0, 220),
        sound: "default",
        priority: "high",
        channelId: "default",
        ...(type === "message" ? {
          categoryId: "myworldmessage",
          // iOS conversation grouping; Android keeps each message alert separate.
          threadId: "mw-" + String(recipient).slice(0, 14) + "-" + String(actorAddress || "").slice(-14),
          ...(senderAvatarUrl ? { richContent: { image: senderAvatarUrl } } : {}),
        } : {}),
        data: {
          url: path,
          path,
          type,
          actorAddress: actorAddress || null,
          statusId: type === "status_like" ? statusId || null : null,
          conversationAddress: type === "message" ? actorAddress || null : null,
          senderAvatarUrl: type === "message" ? senderAvatarUrl : null,
        },
      }));

      try {
        const response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          failed += batch.length;
          logger.warn("[push] Expo request failed:", response.status, result?.errors || "");
          continue;
        }

        const tickets = Array.isArray(result?.data) ? result.data : [result?.data];
        const invalidTokens = tickets.flatMap((ticket, index) =>
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered" &&
          batch[index]
            ? [batch[index]]
            : [],
        );
        const rejected = tickets.filter((ticket) => ticket?.status === "error");
        failed += rejected.length;
        sent += Math.max(0, batch.length - rejected.length);

        if (invalidTokens.length) {
          await query(
            "DELETE FROM push_tokens WHERE user_address = $1 AND token = ANY($2::text[])",
            [recipient, invalidTokens],
          );
        }
        if (rejected.length) {
          logger.warn(
            "[push] Expo rejected one or more messages:",
            rejected.map((ticket) => ticket.message || ticket.details?.error || "unknown error"),
          );
        }
      } catch (error) {
        failed += batch.length;
        logger.warn("[push] delivery request failed:", error?.message || error);
      }
    }

    return { sent, failed, total: tokens.length };
  } catch (error) {
    logger.warn("[push] delivery preparation failed:", error?.message || error);
    return { sent: 0, failed: 1, reason: "delivery_preparation_failed" };
  }
}
