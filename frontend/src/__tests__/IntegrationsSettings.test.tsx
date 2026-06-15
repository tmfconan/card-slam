import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import IntegrationsSettings from "../components/IntegrationsSettings";

const CONFIG_URL = "/api/integrations/zoho/config";

describe("IntegrationsSettings", () => {
  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
  });

  it("shows 'Not configured' when the user has no credentials", async () => {
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({ configured: false, client_id: null })
      )
    );
    render(<IntegrationsSettings />);

    expect(await screen.findByText("Not configured")).toBeInTheDocument();
  });

  it("shows 'Configured' and the saved client_id", async () => {
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({ configured: true, client_id: "my-client-id" })
      )
    );
    render(<IntegrationsSettings />);

    expect(await screen.findByDisplayValue("my-client-id")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
  });

  it("saves the user's own client_id and secret via PUT", async () => {
    let saved: { client_id?: string; client_secret?: string } | null = null;
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({ configured: false, client_id: null })
      ),
      http.put(CONFIG_URL, async ({ request }) => {
        saved = (await request.json()) as typeof saved;
        return HttpResponse.json({ configured: true, client_id: saved!.client_id });
      })
    );

    const user = userEvent.setup();
    render(<IntegrationsSettings />);

    await user.type(await screen.findByLabelText("Client ID"), "user-client");
    await user.type(screen.getByLabelText("Client Secret"), "user-secret");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saved).toEqual({
        client_id: "user-client",
        client_secret: "user-secret",
      });
    });
  });

  it("requires the secret for a brand-new configuration", async () => {
    const putSpy = vi.fn();
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({ configured: false, client_id: null })
      ),
      http.put(CONFIG_URL, () => {
        putSpy();
        return HttpResponse.json({ configured: true, client_id: "x" });
      })
    );

    const user = userEvent.setup();
    render(<IntegrationsSettings />);

    await user.type(await screen.findByLabelText("Client ID"), "user-client");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/client secret is required/i)).toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();
  });
});
