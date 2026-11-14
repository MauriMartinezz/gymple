import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InMemoryGuestStorage } from "@/modules/guest/storage/in-memory-guest-storage";

vi.mock("./actions", () => ({ importGuestDataAction: vi.fn() }));

const { GuestImportOffer } = await import("./guest-import-offer");
const { GuestImportOfferView } = await import("./guest-import-offer-view");
const { importGuestDataAction } = await import("./actions");

const noop = () => {};

describe("GuestImportOffer", () => {
  it("adds nothing to the server render and sends nothing by itself", () => {
    const send = vi.fn();

    expect(renderToStaticMarkup(<GuestImportOffer storage={new InMemoryGuestStorage()} importAction={send} />)).toBe("");
    expect(send).not.toHaveBeenCalled();
    expect(importGuestDataAction).not.toHaveBeenCalled();
  });
});

describe("GuestImportOfferView", () => {
  it("offers the import with an explicit choice", () => {
    const html = renderToStaticMarkup(
      <GuestImportOfferView phase={{ kind: "offer" }} onImport={noop} onDismiss={noop} onClose={noop} />,
    );

    expect(html).toContain("This browser has data from guest mode.");
    expect(html).toContain(">Import guest data</button>");
    expect(html).toContain(">Not now</button>");
  });

  it("shows the import in progress", () => {
    const html = renderToStaticMarkup(
      <GuestImportOfferView phase={{ kind: "importing" }} onImport={noop} onDismiss={noop} onClose={noop} />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Importing…");
  });

  it("confirms a complete import", () => {
    const html = renderToStaticMarkup(
      <GuestImportOfferView
        phase={{ kind: "done", outcome: { status: "imported", summary: "Imported 1 exercise.", skipped: [], warning: null } }}
        onImport={noop}
        onDismiss={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("Imported 1 exercise.");
    expect(html).not.toContain("could not be imported");
  });

  it("says that some data could not be imported and lists it", () => {
    const html = renderToStaticMarkup(
      <GuestImportOfferView
        phase={{
          kind: "done",
          outcome: {
            status: "imported",
            summary: "Imported 1 exercise.",
            skipped: ['Exercise "Broken": Choose a muscle group.', "Workout of 2026-11-03: no sets left to import."],
            warning: null,
          },
        }}
        onImport={noop}
        onDismiss={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("Some data could not be imported:");
    expect(html).toContain("<li>Exercise &quot;Broken&quot;: Choose a muscle group.</li>");
    expect(html).toContain("<li>Workout of 2026-11-03: no sets left to import.</li>");
  });

  it("shows the error after a failure and lets the user try again", () => {
    const html = renderToStaticMarkup(
      <GuestImportOfferView
        phase={{ kind: "done", outcome: { status: "failed", message: "Nothing was imported." } }}
        onImport={noop}
        onDismiss={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Nothing was imported.");
    expect(html).toContain(">Try again</button>");
  });
});
