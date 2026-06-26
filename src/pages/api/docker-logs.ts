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
    const tail = url.searchParams.get("tail") || "100";

    if (
      !containerId ||
      containerId.startsWith("-") ||
      !/^[a-zA-Z0-9_.-]+$/.test(containerId)
    ) {
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

    // Commande Docker pour récupérer les logs
    let logs = [];
    try {
      const output = execFileSync(
        "docker",
        ["logs", "--tail", tail, "--", containerId],
        { stdio: ["pipe", "pipe", "pipe"] },
      ).toString();
      logs = output.trim().split("\n");
    } catch (err: any) {
      // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
      if (err.stderr) {
        logs = err.stderr.toString().trim().split("\n");
      } else {
        throw new Error("Erreur lors de la récupération des logs");
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
