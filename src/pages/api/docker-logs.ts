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

    if (!containerId || !/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(
        JSON.stringify({ error: "ID du conteneur invalide ou manquant" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (tail !== "all" && !/^\d+$/.test(tail)) {
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
      // Sécurité: execFile sans shell pour éviter l'injection de commandes
      const { stdout, stderr } = await execFileAsync("docker", [
        "logs",
        "--tail",
        tail,
        containerId,
      ]);
      // Docker envoie souvent les logs sur stderr même quand ce n'est pas une erreur
      const output = stdout.trim() + "\n" + stderr.trim();
      logs = output.trim().split("\n").filter(Boolean);
    } catch (err: any) {
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n").filter(Boolean);
      } else {
        console.error("Docker logs error:", err);
        throw new Error("Erreur lors de la récupération des logs");
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
