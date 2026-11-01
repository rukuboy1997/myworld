import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EmailPreferencesPanel from "./EmailPreferencesPanel.jsx";
import {
  getEmailNotificationPreferences,
  updateEmailNotificationPreferences,
} from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  getEmailNotificationPreferences: vi.fn(),
  updateEmailNotificationPreferences: vi.fn(),
}));

const preferences = {
  emailEnabled: true,
  unreadMessageReminders: false,
  activityDigest: false,
  reengagementEmails: false,
};

describe("EmailPreferencesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailNotificationPreferences.mockResolvedValue({ ...preferences });
    updateEmailNotificationPreferences.mockImplementation(async (value) => ({ ...value }));
  });

  it("loads saved preferences and keeps optional email categories off by default", async () => {
    render(<EmailPreferencesPanel />);

    expect(await screen.findByRole("switch", { name: /allow optional emails/i })).toBeChecked();
    expect(screen.getByRole("switch", { name: /unread message reminders/i })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /following activity digest/i })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /occasional catch-up emails/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /save preferences/i })).toBeDisabled();
    expect(screen.getByText(/inactive for at least 3 days/i)).toBeInTheDocument();
  });

  it("saves only the user's selected preferences", async () => {
    render(<EmailPreferencesPanel />);

    const unreadSwitch = await screen.findByRole("switch", { name: /unread message reminders/i });
    fireEvent.click(unreadSwitch);
    fireEvent.click(screen.getByRole("switch", { name: /following activity digest/i }));

    const saveButton = screen.getByRole("button", { name: /save preferences/i });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateEmailNotificationPreferences).toHaveBeenCalledWith({
        emailEnabled: true,
        unreadMessageReminders: true,
        activityDigest: true,
        reengagementEmails: false,
      });
    });
    expect(await screen.findByText(/your email preferences have been saved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save preferences/i })).toBeDisabled();
  });

  it("disables optional categories when the master email switch is off", async () => {
    getEmailNotificationPreferences.mockResolvedValue({
      ...preferences,
      emailEnabled: false,
      unreadMessageReminders: true,
    });

    render(<EmailPreferencesPanel />);

    const unreadSwitch = await screen.findByRole("switch", { name: /unread message reminders/i });
    expect(unreadSwitch).toBeDisabled();
    expect(unreadSwitch).toBeChecked();
  });

  it("keeps edits available and reports an API error when saving fails", async () => {
    updateEmailNotificationPreferences.mockRejectedValue(new Error("Network unavailable"));
    render(<EmailPreferencesPanel />);

    fireEvent.click(await screen.findByRole("switch", { name: /unread message reminders/i }));
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("switch", { name: /unread message reminders/i })).toBeChecked();
  });
});
