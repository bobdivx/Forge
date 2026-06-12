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

    // Security: Validate inputs to prevent argument injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(
        JSON.stringify({ error: "Format de l'ID du conteneur invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!/^\d+$/.test(tail) && tail !== "all") {
      return new Response(
        JSON.stringify({ error: "Format du paramètre tail invalide" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Security: Use execFileAsync with argument arrays to prevent command injection
    let logs: string[] = [];
    try {
      const { stdout, stderr } = await execFileAsync("docker", [
        "logs",
        "--tail",
        tail,
        containerId,
      ]);
      // Docker logs can go to either stdout or stderr depending on the containerized app
      const combinedOutput = stdout + (stderr ? "\n" + stderr : "");
      logs = combinedOutput
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
    } catch (err: any) {
      // Handle command failure, but check if we got output in stderr anyway
      if (err.stderr) {
        logs = err.stderr
          .toString()
          .trim()
          .split("\n")
          .filter((line: string) => line.length > 0);
      } else {
        throw err;
      }
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    // Security: Do not leak the error details directly, sanitize them
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
