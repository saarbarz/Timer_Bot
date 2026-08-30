import { describe, expect, it } from "vitest";

import {
  recipientOptionFromChat,
  recipientOptionFromContact,
  recipientOptionFromMessage,
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

  it("maps Baileys contact phoneNumber when it is not already a JID", () => {
    expect(
      recipientOptionFromContact({
        id: "123456789012345@lid",
        phoneNumber: "+972 50-123-4567",
        name: "Phone Number Contact"
      })
    ).toEqual({
      displayName: "Phone Number Contact",
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      source: "contact"
    });
  });

  it("maps Baileys LID contacts and chats through history phone-number mappings", () => {
    const mappings = [{ lid: "123456789012345@lid", pn: "972501234567@s.whatsapp.net" }];

    expect(
      recipientOptionFromContact(
        {
          id: "123456789012345@lid",
          name: "Mapped Contact"
        },
        new Map([["123456789012345@lid", { phoneNumber: "972501234567", jid: "972501234567@s.whatsapp.net" }]])
      )
    ).toMatchObject({
      displayName: "Mapped Contact",
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      source: "contact"
    });

    const store = new RecipientOptionStore();
    store.upsertChats([{ id: "123456789012345@lid", lastMessageRecvTimestamp: 1_798_000_000 }], mappings);
    expect(store.list()).toEqual([
      {
        displayName: "972501234567",
        recipient: {
          phoneNumber: "972501234567",
          jid: "972501234567@s.whatsapp.net"
        },
        source: "chat",
        lastSeenAtUtc: "2026-12-23T04:26:40.000Z"
      }
    ]);
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

  it("maps message upsert remote JIDs into recent recipients", () => {
    expect(
      recipientOptionFromMessage({
        key: {
          remoteJid: "972501234567@s.whatsapp.net"
        },
        pushName: "Recent Sender",
        messageTimestamp: 1_798_000_000
      })
    ).toEqual({
      displayName: "Recent Sender",
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      source: "chat",
      lastSeenAtUtc: "2026-12-23T04:26:40.000Z"
    });
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

  it("reports sanitized recipient collection stats", () => {
    const store = new RecipientOptionStore();
    store.upsertContacts([{ id: "not-a-phone@lid" }]);
    store.upsertChats([{ id: "972501234567@s.whatsapp.net" }]);
    store.upsertMessages([{ key: { remoteJid: "120363000000000000@g.us" } }]);

    expect(store.stats()).toEqual({
      contactsSeen: 1,
      chatsSeen: 1,
      messagesSeen: 1,
      lidMappingsSeen: 0,
      mappedRecipients: 1
    });
    expect(JSON.stringify(store.stats())).not.toMatch(/972|@s\.whatsapp\.net|private text|terminal qr|auth|creds/i);
  });
});
