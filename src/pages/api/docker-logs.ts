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

    // 🛡️ Sentinel: Input validation to prevent command injection
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

    // Commande Docker pour récupérer les logs
    // 🛡️ Sentinel: using execFile with array arguments to prevent shell injection and event loop blocking
    let logs = [];
    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["logs", "--tail", tail, containerId],
        { maxBuffer: 1024 * 1024 * 5 },
      );
      // Combine stdout and stderr since a container may output to both streams simultaneously
      logs = `${stdout}\n${stderr}`.trim().split("\n");
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
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
