import type { APIRoute } from 'astro';
import { getOpenClawToken } from '../../lib/auth';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const email = locals.user?.email;
    const token = getOpenClawToken(email);
    
    // Si pas de token, on renvoie une liste vide ou d'erreur
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token manquant' }), { status: 401 });
    }

    // On interroge le Gateway pour avoir les vraies sessions actives
    const response = await fetch('http://localhost:18789/api/sessions?limit=50', {
      headers: { 'X-Gateway-Token': token }
    });

    if (!response.ok) {
        throw new Error('Erreur Gateway');
    }

    const data = await response.json();
    
    // Transformation des sessions en format attendu par le Dashboard
    // On mappe les sessions OpenClaw vers l'affichage "Swarm"
    const agents = data.sessions.map((s: any) => ({
      name: s.displayName || s.agentId || 'Agent Inconnu',
      status: s.status === 'running' ? 'actif' : 'en veille',
      cpu: Math.floor(Math.random() * 20) + (s.status === 'running' ? 10 : 0), // Simulation CPU basée sur l'état réel
      lastSeen: new Date(s.updatedAt).toLocaleTimeString('fr-FR'),
      model: s.model
    }));

    // Si aucune session n'est active, on montre au moins que le système est prêt
    if (agents.length === 0) {
       return new Response(JSON.stringify([{ name: 'SYSTEM_READY', status: 'en veille', cpu: 0 }]), { status: 200 });
    }

    return new Response(JSON.stringify(agents), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Impossible de contacter le Gateway" }), { status: 500 });
  }
};
