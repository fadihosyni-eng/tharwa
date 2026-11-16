// serva-g.com and www.serva-g.com → the game's main address (keeps path and query).
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return Response.redirect(env.TARGET + url.pathname + url.search, 301);
  },
};
