import type { APIRoute } from "astro";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    const tail = url.searchParams.get("tail") || "100";

    if (!containerId || !/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur invalide ou manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!/^\d+$/.test(tail)) {
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
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["logs", "--tail", tail, containerId],
        { timeout: 10_000 },
      );
      // Some containers log to stderr, combine or use fallback
      const combined = (stdout + "\n" + stderr).trim();
      logs = combined.split("\n").filter(Boolean);
    } catch (err: any) {
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n").filter(Boolean);
      } else {
        throw err;
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const sanitizedError = error.message.replace(
      /https:\/\/[^@]+@/g,
      "https://***@",
    );
    return new Response(
      JSON.stringify({ error: "Logs indisponibles: " + sanitizedError }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
