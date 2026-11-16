// game.serva-g.com and www.serva-g.com → the main address serva-g.com (keeps path and query).
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return Response.redirect(env.TARGET + url.pathname + url.search, 301);
  },
};
