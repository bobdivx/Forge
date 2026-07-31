import type { APIRoute } from "astro";
import { execFile } from "child_process";
import { promisify } from "util";

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

    if (!containerId) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 🛡️ Sentinel: Validate input to prevent flag injection
    if (containerId.startsWith("-") || tail.startsWith("-")) {
      return new Response(JSON.stringify({ error: "Invalid parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let logs: string[] = [];
    try {
      // 🛡️ Sentinel: Use execFile to prevent command injection
      const { stdout } = await execFileAsync("docker", [
        "logs",
        "--tail",
        tail,
        "--",
        containerId,
      ]);
      logs = stdout.trim().split("\n");
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
    // 🛡️ Sentinel: Sanitize error message to prevent sensitive info leakage
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
