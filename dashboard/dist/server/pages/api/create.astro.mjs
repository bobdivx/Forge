import { exec } from 'child_process';
export { renderers } from '../../renderers.mjs';

const POST = async ({
  request
}) => {
  const data = await request.json();
  const name = String(data?.name ?? "").trim();
  if (!name) {
    return new Response(JSON.stringify({
      error: "Nom invalide"
    }), {
      status: 400
    });
  }
  const result = await new Promise((resolve) => {
    exec(`openclaw task "CREATE_NEW_APP ${name}"`, (err) => {
      if (err) {
        resolve({
          error: err.message
        });
        return;
      }
      resolve({});
    });
  });
  if (result.error) {
    return new Response(JSON.stringify({
      error: result.error
    }), {
      status: 500
    });
  }
  return new Response(JSON.stringify({
    status: "started",
    app: name
  }), {
    status: 200
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
