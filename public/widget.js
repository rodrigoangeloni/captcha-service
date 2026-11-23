/*
 * Widget embebible del servicio de CAPTCHA.
 *
 * Uso en otro sitio:
 *   <div id="captcha"></div>
 *   <script src="https://TU-SERVICIO/widget.js"
 *           data-target="captcha"
 *           data-site="mi-sitio"></script>
 *
 * Dentro del div se crean:
 *   <img> imagen del captcha
 *   <input name="captcha"> texto que escribe el usuario
 *   <input type="hidden" name="captcha_token"> token para validar
 */
(function (global) {
  'use strict';

  var script = document.currentScript ||
    (function () {
      var scripts = document.scripts;
      return scripts[scripts.length - 1];
    }());

  var autoService = script && script.src
    ? script.src.replace(/\/widget\.js(\?.*)?$/, '').replace(/\/$/, '')
    : '';

  function createWidget(options) {
    options = options || {};

    var base = (options.serviceUrl || autoService).replace(/\/$/, '');
    var site = options.site || '';
    var tokenName = options.tokenName || 'captcha_token';
    var inputName = options.inputName || 'captcha';

    var container = typeof options.container === 'string'
      ? document.getElementById(options.container)
      : options.container;

    if (!container) throw new Error('Contenedor de CAPTCHA no encontrado');

    var img = document.createElement('img');
    img.alt = 'captcha';
    img.width = 150;
    img.height = 50;
    img.style.border = '1px solid #c7ced7';
    img.style.display = 'block';
    img.style.marginBottom = '6px';

    var input = document.createElement('input');
    input.type = 'text';
    input.name = inputName;
    input.placeholder = 'Escriba el texto aquí';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.required = true;
    input.style.display = 'block';
    input.style.marginBottom = '6px';
    input.style.padding = '6px';

    var token = document.createElement('input');
    token.type = 'hidden';
    token.name = tokenName;
    token.value = '';

    var refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Actualizar código';
    refresh.style.border = '0';
    refresh.style.background = 'none';
    refresh.style.color = '#0b6bb5';
    refresh.style.textDecoration = 'underline';
    refresh.style.cursor = 'pointer';
    refresh.style.padding = '0';

    container.appendChild(img);
    container.appendChild(input);
    container.appendChild(token);
    container.appendChild(refresh);

    function load() {
      return fetch(base + '/api/challenge?site=' + encodeURIComponent(site), {
        headers: { 'Accept': 'application/json' }
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (!data || !data.token) throw new Error('Respuesta inválida del servicio');
          img.src = new URL(data.url, base + '/').href + '&t=' + Date.now();
          token.value = data.token;
          input.value = '';
          return data;
        })
        .catch(function (err) {
          img.alt = 'Error al cargar CAPTCHA';
          console.error('[captcha]', err);
          throw err;
        });
    }

    refresh.addEventListener('click', function () {
      load();
      input.focus();
    });

    load();

    return {
      getToken: function () { return token.value; },
      getAnswer: function () { return input.value; },
      refresh: load,
      elements: { image: img, input: input, token: token }
    };
  }

  global.CaptchaService = { create: createWidget };

  // Auto-inicialización si el script trae data-target
  if (script && script.getAttribute('data-target')) {
    global.addEventListener('DOMContentLoaded', function () {
      createWidget({
        container: script.getAttribute('data-target'),
        site: script.getAttribute('data-site') || '',
        tokenName: script.getAttribute('data-token-name') || 'captcha_token',
        inputName: script.getAttribute('data-input-name') || 'captcha',
        serviceUrl: script.getAttribute('data-service') || autoService
      });
    });
  }
}(window));
