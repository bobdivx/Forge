import type { APIRoute } from "astro";
import { execFileSync } from "child_process";

export const GET: APIRoute = async ({ url }) => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    if (isVercel) {
      return new Response(
        JSON.stringify({ logs: ["Docker logs non disponibles sur Vercel"] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const containerId = url.searchParams.get("id");
    const tailInput = url.searchParams.get("tail") || "100";

    if (!containerId || typeof containerId !== "string") {
      return new Response(
        JSON.stringify({ error: "ID du conteneur manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Input validation: prevent command argument injection (no flags/unsupported chars)
    if (!/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      return new Response(
        JSON.stringify({ error: "Format ID conteneur invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const tail = parseInt(tailInput, 10);
    if (isNaN(tail) || tail < 1 || tail > 10000) {
      return new Response(
        JSON.stringify({ error: "Paramètre tail invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let logs = [];
    try {
      // Using execFileSync with an argument array to prevent shell injection
      const output = execFileSync(
        "docker",
        ["logs", "--tail", String(tail), "--", containerId],
        { stdio: ["pipe", "pipe", "pipe"] },
      ).toString();
      logs = output.trim().split("\n");
    } catch (err: any) {
      // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n");
      } else {
        throw err;
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    // Return a sanitized error message
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
