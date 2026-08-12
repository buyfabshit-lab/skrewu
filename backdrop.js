/* ============ BACKDROP ============ */
/* The layer that goes BEHIND you on a stream, where the live overlay goes in  */
/* front. Add it as a browser source under your camera, key yourself out, and  */
/* the shop's colours are the room you're standing in.                        */
/*                                                                            */
/*   backdrop.html?theme=tropical                                             */
/*   backdrop.html?shop=deathcorps            (takes that shop's face)        */
/*                                                                            */
/* &style=blobs|stripes|grid|plain · &words=center|corner|off                 */
/* &name=... &sub=... to override the wording · &still=1 to stop all motion   */
/*                                                                            */
/* Nothing here animates in JavaScript. A stream is already asking a lot of    */
/* the machine, so the movement is CSS on transform and opacity only and the   */
/* compositor carries it. &still=1 stops even that on a weaker machine.        */

(function () {
  const $ = (id) => document.getElementById(id);
  const p = new URLSearchParams(location.search);

  const STYLES = ['blobs', 'stripes', 'grid', 'plain'];
  const WORDS = ['center', 'corner', 'off'];
  const pick = (val, allowed, fallback) =>
    allowed.includes(String(val || '')) ? String(val) : fallback;

  if (p.get('still') === '1') document.body.classList.add('still');

  (window.themeReady || Promise.resolve(null)).then(theme => {
    // Each face has a look that suits it; the query string still wins.
    const fromTheme = theme && theme.backdrop ? theme.backdrop : 'blobs';
    document.body.dataset.style = pick(p.get('style'), STYLES, fromTheme);

    const where = pick(p.get('words'), WORDS, 'center');
    document.body.dataset.words = where;

    const name = p.get('name') || (theme && theme.name) || '';
    const sub = p.get('sub') || (theme && theme.backdropSub) || '';

    if (where === 'off' || !name) {
      $('words').classList.add('off');
    } else {
      $('words').classList.remove('off');
      $('wName').textContent = name;        // textContent, so a name can't inject markup
      $('wSub').textContent = sub;
      if (!sub) $('wSub').style.display = 'none';
    }
  });
})();
