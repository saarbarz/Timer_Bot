import { describe, expect, it } from "vitest";

import {
  recipientOptionFromChat,
  recipientOptionFromContact,
  RecipientOptionStore
} from "../../src/whatsapp/RecipientOptions.js";

describe("Recipient options", () => {
  it("maps Baileys contact data to an individual recipient option", () => {
    expect(
      recipientOptionFromContact({
        id: "972501234567@s.whatsapp.net",
        name: "Test Contact",
        notify: "Fallback Name"
      })
    ).toEqual({
      displayName: "Test Contact",
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      source: "contact"
    });
  });

  it("maps recent chat data and ignores group chats", () => {
    expect(
      recipientOptionFromChat({
        id: "972501234567@s.whatsapp.net",
        lastMessageRecvTimestamp: 1_798_000_000
      })
    ).toMatchObject({
      displayName: "972501234567",
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      source: "chat",
      lastSeenAtUtc: "2026-12-23T04:26:40.000Z"
    });

    expect(recipientOptionFromChat({ id: "120363000000000000@g.us" })).toBeUndefined();
  });

  it("dedupes by JID and prefers contact display names", () => {
    const store = new RecipientOptionStore();
    store.upsertChats([
      {
        id: "972501234567@s.whatsapp.net",
        lastMessageRecvTimestamp: 1_798_000_000
      }
    ]);
    store.upsertContacts([
      {
        id: "972501234567@s.whatsapp.net",
        name: "Saved Name"
      }
    ]);
    store.upsertChats([
      {
        id: "972501234567@s.whatsapp.net",
        lastMessageRecvTimestamp: 1_798_000_030
      }
    ]);

    expect(store.list()).toEqual([
      {
        displayName: "Saved Name",
        recipient: {
          phoneNumber: "972501234567",
          jid: "972501234567@s.whatsapp.net"
        },
        source: "contact",
        lastSeenAtUtc: "2026-12-23T04:27:10.000Z"
      }
    ]);
  });
});
