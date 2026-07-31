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

    if (!containerId) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Commande Docker pour récupérer les logs

    // 🛡️ Sentinel: Validate container ID to prevent flag injection
    if (containerId.startsWith("-")) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 🛡️ Sentinel: Validate and parse tail parameter to ensure it is a safe integer
    const parsedTail = parseInt(tail, 10);
    if (isNaN(parsedTail) || parsedTail < 0) {
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
      // 🛡️ Sentinel: Use execFileAsync with an array of arguments to prevent command injection
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["logs", "--tail", parsedTail.toString(), containerId],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      const output = stdout || stderr; // Docker logs often outputs to stderr
      logs = output.trim().split("\n");
    } catch (err: any) {
      // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n");
      } else {
        // 🛡️ Sentinel: Sanitize error message
        throw new Error("Erreur lors de la récupération des logs Docker");
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Logs indisponibles: " + error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
