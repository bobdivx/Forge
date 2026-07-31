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

    if (containerId.startsWith("-")) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let logs: string[] = [];
    try {
      const { stdout, stderr } = await execFileAsync("docker", [
        "logs",
        "--tail",
        String(tail),
        "--",
        containerId,
      ]);
      const output =
        stdout.toString() + (stderr ? "\n" + stderr.toString() : "");
      logs = output.trim() ? output.trim().split("\n") : [];
    } catch (err: any) {
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n");
      } else {
        throw new Error("Erreur d'exécution Docker");
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    // Ne pas exposer error.message directement pour éviter les fuites d'informations
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
